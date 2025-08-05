#!/usr/bin/env python3
"""
PDF Recipe Processor
====================

A standalone script that:
1. Finds PDFs in a directory without accompanying JPG/JSON files
2. Converts PDFs to JPG images
3. Uses Ollama API to analyze images and extract recipe information
4. Generates JSON files following the recipe template schema
5. Saves JPGs and JSON alongside original PDFs

Usage:
    python pdf_to_recipe.py <directory_path>

Requirements:
    pip install pdf2image pillow requests ollama

System Requirements:
    - poppler-utils (for PDF conversion)
    - Ollama running locally with gemma3:12b model
"""

import os
import sys
import json
import base64
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import argparse

try:
    from pdf2image import convert_from_path
    from PIL import Image
    import requests
    import ollama
except ImportError as e:
    print(f"Missing required dependency: {e}")
    print("Please install required packages:")
    print("pip install pdf2image pillow requests ollama")
    sys.exit(1)


class PDFRecipeProcessor:
    """Main processor class for converting PDFs to recipe JSON files."""
    
    def __init__(self, directory: str, model: str = "gemma3:12b"):
        self.directory = Path(directory)
        self.model = model
        self.ollama_base_url = "http://localhost:11434"
        
        # Validate directory exists
        if not self.directory.exists():
            raise ValueError(f"Directory does not exist: {directory}")
        
        # Check Ollama connection
        self._check_ollama_connection()
    
    def _check_ollama_connection(self) -> None:
        """Check if Ollama is running and the model is available."""
        try:
            response = requests.get(f"{self.ollama_base_url}/api/tags")
            if response.status_code != 200:
                raise ConnectionError("Ollama server not responding")
            
            models = response.json().get('models', [])
            model_names = [model['name'] for model in models]
            
            if self.model not in model_names:
                print(f"Model {self.model} not found. Available models: {model_names}")
                print(f"Please pull the model: ollama pull {self.model}")
                sys.exit(1)
                
        except requests.ConnectionError:
            print("Cannot connect to Ollama. Please ensure Ollama is running.")
            print("Start Ollama with: ollama serve")
            sys.exit(1)
    
    def find_unprocessed_pdfs(self) -> List[Path]:
        """Find PDFs that don't have accompanying JPG or JSON files."""
        pdfs = list(self.directory.glob("*.pdf"))
        unprocessed = []
        
        for pdf_path in pdfs:
            base_name = pdf_path.stem
            
            # Check for any accompanying files
            has_jpg = any(self.directory.glob(f"{base_name}*.jpg"))
            has_json = (self.directory / f"{base_name}.json").exists()
            
            if not (has_jpg or has_json):
                unprocessed.append(pdf_path)
        
        return unprocessed
    
    def convert_pdf_to_images(self, pdf_path: Path) -> List[Path]:
        """Convert PDF to JPG images, one per page."""
        try:
            # Convert PDF to images
            images = convert_from_path(pdf_path, dpi=200, fmt='jpeg')
            
            image_paths = []
            base_name = pdf_path.stem
            
            for i, image in enumerate(images, 1):
                if len(images) == 1:
                    # Single page PDF
                    image_path = self.directory / f"{base_name}.jpg"
                else:
                    # Multi-page PDF
                    image_path = self.directory / f"{base_name}_page{i}.jpg"
                
                image.save(image_path, 'JPEG', quality=85, optimize=True)
                image_paths.append(image_path)
            
            return image_paths
            
        except Exception as e:
            print(f"Error converting PDF {pdf_path}: {e}")
            return []
    
    def encode_image_to_base64(self, image_path: Path) -> str:
        """Encode image to base64 for Ollama API."""
        with open(image_path, 'rb') as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    
    def analyze_images_with_ollama(self, image_paths: List[Path]) -> Optional[Dict]:
        """Use Ollama to analyze images and extract recipe information."""
        
        # Prepare images for the API
        images_data = []
        for image_path in image_paths:
            images_data.append(self.encode_image_to_base64(image_path))
        
        # Create prompt for recipe extraction
        prompt = """
Analyze the provided recipe image(s) and extract all recipe information. 
Return ONLY a valid JSON object with the following structure:

{
  "name": "Recipe name",
  "description": "Brief description of the recipe",
  "ingredients": [
    {
      "name": "ingredient name",
      "quantity": number_or_fraction,
      "unit": "measurement unit (cup, tbsp, etc)",
      "optional": false
    }
  ],
  "instructions": [
    "Step 1 instruction",
    "Step 2 instruction"
  ],
  "servings": number,
  "defaultDuration": 2,
  "tags": ["tag1", "tag2"],
  "category": "Main Course/Appetizer/Dessert/etc",
  "prepTime": minutes_number,
  "cookTime": minutes_number
}

Important guidelines:
- Extract ALL ingredients with accurate quantities and units
- Some recipes have quantities for different number of people. when this is the case, always take the ingredients from the 4 person list
- Often recipe ingredients will be grouped by different parts of the meal (i.e. for a noodle chicken salad there may be "Noodle Salad", "Chicken" and Peanut Dressing") - when collecting ingredients, ignore these groups and collect ingredients for the full meal
- Instructions should be extracts as accurately as possible from the image. Do not expand upon, or summarize instructions
- Estimate reasonable prep and cook times if not specified
- Choose appropriate category (Main Course, Appetizer, Dessert, Breakfast, etc.)
- Add relevant tags (cuisine type, dietary restrictions, cooking method, etc.)
- Set defaultDuration to 2 (days)
- If quantities use fractions, convert to decimals (1/2 = 0.5)
- Return ONLY the JSON, no additional text or explanation
"""

        try:
            # Call Ollama API
            response = ollama.chat(
                model=self.model,
                messages=[
                    {
                        'role': 'user',
                        'content': prompt,
                        'images': images_data
                    }
                ]
            )
            
            # Extract and parse the response
            content = response['message']['content'].strip()
            
            # Try to extract JSON from the response
            # Sometimes models add extra text, so we look for JSON block
            start_idx = content.find('{')
            end_idx = content.rfind('}') + 1
            
            if start_idx != -1 and end_idx != -1:
                json_str = content[start_idx:end_idx]
                recipe_data = json.loads(json_str)
                return recipe_data
            else:
                print(f"No valid JSON found in response: {content}")
                return None
                
        except Exception as e:
            print(f"Error calling Ollama API: {e}")
            return None
    
    def create_recipe_json(self, recipe_data: Dict, image_paths: List[Path], pdf_path: Path) -> Dict:
        """Create the final recipe JSON following the template schema."""
        
        # Create image references
        images = []
        for image_path in image_paths:
            images.append({"src": f"./{image_path.name}"})
        
        # Create the recipe object with the template structure
        recipe = {
            "name": recipe_data.get("name", pdf_path.stem),
            "description": recipe_data.get("description", ""),
            "images": images,
            "ingredients": recipe_data.get("ingredients", []),
            "instructions": recipe_data.get("instructions", []),
            "servings": recipe_data.get("servings", 4),
            "defaultDuration": recipe_data.get("defaultDuration", 2),
            "tags": recipe_data.get("tags", [])
        }
        
        # Add optional fields if present
        if "category" in recipe_data:
            recipe["category"] = recipe_data["category"]
        if "prepTime" in recipe_data:
            recipe["prepTime"] = recipe_data["prepTime"]
        if "cookTime" in recipe_data:
            recipe["cookTime"] = recipe_data["cookTime"]
        
        # Create the full JSON structure following the template
        full_json = {
            "version": 1,
            "exportDate": datetime.utcnow().isoformat() + "Z",
            "recipes": [recipe]
        }
        
        return full_json
    
    def save_recipe_json(self, recipe_json: Dict, pdf_path: Path) -> Path:
        """Save the recipe JSON file alongside the PDF."""
        json_path = self.directory / f"{pdf_path.stem}.json"
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(recipe_json, f, indent=2, ensure_ascii=False)
        
        return json_path
    
    def process_pdf(self, pdf_path: Path) -> bool:
        """Process a single PDF file completely."""
        print(f"Processing: {pdf_path.name}")
        
        # Step 1: Convert PDF to images
        print("  Converting PDF to images...")
        image_paths = self.convert_pdf_to_images(pdf_path)
        if not image_paths:
            print(f"  Failed to convert PDF: {pdf_path}")
            return False
        
        print(f"  Created {len(image_paths)} image(s)")
        
        # Step 2: Analyze images with Ollama
        print("  Analyzing images with Ollama...")
        recipe_data = self.analyze_images_with_ollama(image_paths)
        if not recipe_data:
            print(f"  Failed to extract recipe data from: {pdf_path}")
            # Clean up images on failure
            for img_path in image_paths:
                img_path.unlink(missing_ok=True)
            return False
        
        # Step 3: Create and save JSON
        print("  Creating recipe JSON...")
        recipe_json = self.create_recipe_json(recipe_data, image_paths, pdf_path)
        json_path = self.save_recipe_json(recipe_json, pdf_path)
        
        print(f"  ✓ Completed: {json_path.name}")
        print(f"    Recipe: {recipe_data.get('name', 'Unknown')}")
        print(f"    Images: {[p.name for p in image_paths]}")
        
        return True
    
    def process_all(self) -> None:
        """Process all unprocessed PDFs in the directory."""
        unprocessed_pdfs = self.find_unprocessed_pdfs()
        
        if not unprocessed_pdfs:
            print("No unprocessed PDFs found in directory.")
            return
        
        print(f"Found {len(unprocessed_pdfs)} unprocessed PDF(s)")
        print(f"Directory: {self.directory}")
        print(f"Model: {self.model}")
        print("-" * 50)
        
        successful = 0
        failed = 0
        
        for pdf_path in unprocessed_pdfs:
            try:
                if self.process_pdf(pdf_path):
                    successful += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"  Error processing {pdf_path}: {e}")
                failed += 1
            print()
        
        print("-" * 50)
        print(f"Processing complete:")
        print(f"  Successful: {successful}")
        print(f"  Failed: {failed}")
        print(f"  Total: {len(unprocessed_pdfs)}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Convert PDF recipes to JSON using Ollama AI analysis"
    )
    parser.add_argument(
        "directory",
        help="Directory containing PDF files to process"
    )
    parser.add_argument(
        "--model",
        default="gemma3:12b",
        help="Ollama model to use (default: gemma3:12b)"
    )
    
    args = parser.parse_args()
    
    try:
        processor = PDFRecipeProcessor(args.directory, args.model)
        processor.process_all()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()