#!/usr/bin/env python3
"""
PDF Recipe Processor
====================

A standalone script that:
1. Finds PDFs in a directory without accompanying JPG/JSON files
2. Converts PDFs to JPG images
3. Uses OpenAI-compatible API with a five-action approach to extract recipe information:
   - Action 1: Extract meal title, description, category, and tags, rename files with unix-safe filename (uses first image only)
   - Action 2: Detect bounding boxes for ingredients and instructions sections, crop images
   - Action 3: Extract recipe instructions from cropped instructions image
   - Action 4: Extract ingredients from cropped ingredients image (4-person section)
   - Action 5: Combine all outputs into final JSON structure
4. Generates JSON files following the recipe template schema
5. Saves JPGs, cropped images, and JSON alongside original PDFs

Usage:
    python pdf_to_recipe.py <directory_path>

Requirements:
    pip install pdf2image pillow requests openai

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
import re

try:
    from pdf2image import convert_from_path
    from PIL import Image
    import requests
    from openai import OpenAI
except ImportError as e:
    print(f"Missing required dependency: {e}")
    print("Please install required packages:")
    print("pip install pdf2image pillow requests openai")
    sys.exit(1)


class OpenAIConfig:
    """Configuration for OpenAI API calls."""
    
    def __init__(self, api_key: str = "ollama", base_url: str = "http://localhost:11434/v1", model: str = "gemma3:12b"):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model


def make_unix_safe_filename(title: str) -> str:
    """Convert a meal title to a unix-safe filename."""
    if not title:
        return "unknown_recipe"
    
    # Remove or replace problematic characters
    safe_name = re.sub(r'[^\w\s-]', '', title.strip())
    # Replace spaces and multiple whitespace with underscores
    safe_name = re.sub(r'\s+', '_', safe_name)
    # Remove leading/trailing underscores and convert to lowercase
    safe_name = safe_name.strip('_').lower()
    
    # Ensure it's not empty and not too long
    if not safe_name:
        return "unknown_recipe"
    
    return safe_name[:50]  # Limit length to 50 characters


class PDFRecipeProcessor:
    """Main processor class for converting PDFs to recipe JSON files."""
    
    def __init__(self, directory: str, default_config: OpenAIConfig, action_configs: Dict[int, OpenAIConfig] = None, max_action: int = None, skip_action2: bool = False):
        self.directory = Path(directory)
        self.default_config = default_config
        self.action_configs = action_configs or {}
        self.max_action = max_action
        self.skip_action2 = skip_action2
        
        # Validate directory exists
        if not self.directory.exists():
            raise ValueError(f"Directory does not exist: {directory}")
        
        # Check API connection
        self._check_api_connection()
    
    def _get_config_for_action(self, action_number: int) -> OpenAIConfig:
        """Get the configuration for a specific action, falling back to default."""
        return self.action_configs.get(action_number, self.default_config)
    
    def _create_client(self, config: OpenAIConfig) -> OpenAI:
        """Create an OpenAI client with the given configuration."""
        return OpenAI(
            api_key=config.api_key,
            base_url=config.base_url
        )
    
    def _check_api_connection(self) -> None:
        """Check if the API is accessible."""
        try:
            client = self._create_client(self.default_config)
            # Try to list models to verify connection
            models = client.models.list()
            print(f"Connected to API at {self.default_config.base_url}")
        except Exception as e:
            print(f"Warning: Could not verify API connection: {e}")
            print("Proceeding anyway - connection will be tested during processing")
    
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
    
    def action_1_extract_meal_title(self, image_paths: List[Path], pdf_path: Path) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[List[str]], List[Path], Path]:
        """Action 1: Identify the meal title, description, category, and tags, rename files with unix-safe version."""
        
        config = self._get_config_for_action(1)
        client = self._create_client(config)
        
        # Use only the first image
        image_data = self.encode_image_to_base64(image_paths[0])
        
        prompt = """
Analyze the provided recipe image and extract the meal title, description, category, and tags.
Return the information in JSON format with this exact structure:
{
  "title": "meal title exactly as written",
  "description": "brief description of the meal (1-2 sentences about what it is, key flavors, or cooking style)",
  "category": "meal category from the allowed list",
  "tags": ["tag1", "tag2", "tag3"]
}

Important:
- Extract the title exactly as written on the recipe
- For description, look for any subtitle, tagline, or descriptive text about the meal
- If no explicit description is visible, create a brief 1-2 sentence description based on the meal name and visible ingredients/style
- Category must be ONE of: "Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Appetizer"
- Choose the category that best fits the meal type based on the recipe content
- Tags should be 3-6 relevant descriptive words/phrases for searching (e.g., "quick", "italian", "one pot", "vegetarian", "spicy", "healthy")
- Tags should help users find this recipe when searching
- Return ONLY the JSON, no additional text
"""

        try:
            response = client.chat.completions.create(
                model=config.model,
                messages=[
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'text',
                                'text': prompt
                            },
                            {
                                'type': 'image_url',
                                'image_url': {
                                    'url': f"data:image/jpeg;base64,{image_data}"
                                }
                            }
                        ]
                    }
                ]
            )
            
            content = response.choices[0].message.content.strip()
            if not content:
                return None, None, None, None, image_paths, pdf_path
            
            # Try to extract JSON from response
            start_idx = content.find('{')
            end_idx = content.rfind('}') + 1
            
            title = None
            description = None
            category = None
            tags = None
            
            if start_idx != -1 and end_idx != -1:
                try:
                    json_str = content[start_idx:end_idx]
                    parsed_data = json.loads(json_str)
                    title = parsed_data.get('title', '')
                    description = parsed_data.get('description', '')
                    category = parsed_data.get('category', '')
                    tags = parsed_data.get('tags', [])
                except json.JSONDecodeError:
                    # Fallback: treat the entire content as title
                    title = content
                    description = ""
                    category = "Dinner"  # Default category
                    tags = []
            else:
                # Fallback: treat the entire content as title
                title = content
                description = ""
                category = "Dinner"  # Default category
                tags = []
            
            if not title:
                return None, None, None, None, image_paths, pdf_path
            
            # Validate category
            valid_categories = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert', 'Appetizer']
            if category not in valid_categories:
                category = "Dinner"  # Default to Dinner if invalid
            
            # Validate tags (ensure it's a list of strings)
            if not isinstance(tags, list):
                tags = []
            tags = [str(tag) for tag in tags if tag]  # Convert to strings and filter empty
            
            # Create unix-safe filename
            safe_name = make_unix_safe_filename(title)
            
            # Rename PDF
            new_pdf_path = self.directory / f"{safe_name}.pdf"
            if pdf_path != new_pdf_path:
                pdf_path.rename(new_pdf_path)
            else:
                new_pdf_path = pdf_path
            
            # Rename image files
            new_image_paths = []
            for i, image_path in enumerate(image_paths):
                if len(image_paths) == 1:
                    new_image_path = self.directory / f"{safe_name}.jpg"
                else:
                    new_image_path = self.directory / f"{safe_name}_page{i+1}.jpg"
                
                image_path.rename(new_image_path)
                new_image_paths.append(new_image_path)
            
            return title, description, category, tags, new_image_paths, new_pdf_path
                
        except Exception as e:
            print(f"Error in Action 1 - Extract meal title, description, category, and tags: {e}")
            return None, None, None, None, image_paths, pdf_path
    
    def action_2_detect_bounding_boxes(self, image_paths: List[Path]) -> Optional[Dict]:
        """Action 2: Detect bounding boxes for ingredients and instructions."""
        
        config = self._get_config_for_action(2)
        client = self._create_client(config)
        
        # Select appropriate image - second if available, otherwise first
        if len(image_paths) >= 2:
            image_data = self.encode_image_to_base64(image_paths[1])
        else:
            image_data = self.encode_image_to_base64(image_paths[0])
        
        prompt = """
return only json in the following format
```json
{
"ingredients": {
"top": <number>,
"left": <number>,
"bottom": <number>,
"right": <number>
},
"instructions": {
"top": <number>,
"left": <number>,
"bottom": <number>,
"right": <number>
}
}
```

Locate the meal ingredients (if multiple sets of meal ingredients exist, locate the meal ingredients for 4 people) in the attached image and provide the bounding box in pixels that encapsulated the entire ingredient list, relative to the top left of the image.

Then, locate the meal instructions in the attached image, and provide a bounding box that encapsulates the entire instruction list, in pixels relative to the top left of the image.

top: the number of pixels from the top of the image to the top edge of the bounding box
left: the number of pixels from the left of the image to the left edge of the bounding box
bottom: the number of pixels from the top of the image to the bottom edge of the bounding box
right: the number of pixels from the left of the image to the right edge of the bounding box
"""

        try:
            response = client.chat.completions.create(
                model=config.model,
                messages=[
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'text',
                                'text': prompt
                            },
                            {
                                'type': 'image_url',
                                'image_url': {
                                    'url': f"data:image/jpeg;base64,{image_data}"
                                }
                            }
                        ]
                    }
                ]
            )
            
            content = response.choices[0].message.content.strip()
            
            # Extract JSON from response
            start_idx = content.find('{')
            end_idx = content.rfind('}') + 1
            
            if start_idx != -1 and end_idx != -1:
                json_str = content[start_idx:end_idx]
                bounding_boxes = json.loads(json_str)
                return bounding_boxes
            else:
                print(f"No valid JSON found in bounding box response: {content}")
                return None
                
        except Exception as e:
            print(f"Error in Action 2 - Detect bounding boxes: {e}")
            return None

    def crop_images_from_bounding_boxes(self, image_paths: List[Path], bounding_boxes: Dict, safe_name: str) -> Tuple[Optional[Path], Optional[Path]]:
        """Crop ingredients and instructions images from bounding boxes."""
        
        # Select the appropriate image - second if available, otherwise first
        if len(image_paths) >= 2:
            source_image_path = image_paths[1]
        else:
            source_image_path = image_paths[0]
        
        try:
            with Image.open(source_image_path) as img:
                ingredients_path = None
                instructions_path = None
                
                # Crop ingredients
                if 'ingredients' in bounding_boxes:
                    bbox = bounding_boxes['ingredients']
                    ingredients_crop = img.crop((bbox['left'], bbox['top'], bbox['right'], bbox['bottom']))
                    ingredients_path = self.directory / f"{safe_name}_ingredients.jpg"
                    ingredients_crop.save(ingredients_path, 'JPEG', quality=85, optimize=True)
                
                # Crop instructions
                if 'instructions' in bounding_boxes:
                    bbox = bounding_boxes['instructions']
                    instructions_crop = img.crop((bbox['left'], bbox['top'], bbox['right'], bbox['bottom']))
                    instructions_path = self.directory / f"{safe_name}_instructions.jpg"
                    instructions_crop.save(instructions_path, 'JPEG', quality=85, optimize=True)
                
                return ingredients_path, instructions_path
                
        except Exception as e:
            print(f"Error cropping images: {e}")
            return None, None

    def action_3_extract_instructions(self, image_paths: List[Path]) -> Optional[List[str]]:
        """Action 3: Extract recipe instructions from cropped image."""
        
        config = self._get_config_for_action(3)
        client = self._create_client(config)
        
        # Select the appropriate image - second if available, otherwise first
        if len(image_paths) >= 2:
            source_image_path = image_paths[1]
        else:
            source_image_path = image_paths[0]
        
        # Use the source image
        image_data = self.encode_image_to_base64(source_image_path)
        
        prompt = """
Analyze the provided recipe image and extract all recipe instruction text.
Return the instructions as plain text, with each step on a separate line.
Extract the instructions exactly as written - do not expand upon or summarize.
Do not include any additional text, explanations, or formatting beyond the actual instructions.
"""

        try:
            response = client.chat.completions.create(
                model=config.model,
                messages=[
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'text',
                                'text': prompt
                            },
                            {
                                'type': 'image_url',
                                'image_url': {
                                    'url': f"data:image/jpeg;base64,{image_data}"
                                }
                            }
                        ]
                    }
                ]
            )
            
            content = response.choices[0].message.content.strip()
            # Split into individual instructions
            instructions = [line.strip() for line in content.split('\n') if line.strip()]
            return instructions if instructions else None
                
        except Exception as e:
            print(f"Error in Action 3 - Extract instructions: {e}")
            return None
    
    def action_4_extract_ingredients(self, image_paths: List[Path]) -> Optional[List[Dict]]:
        """Action 4: Extract meal ingredients from cropped image."""
        
        config = self._get_config_for_action(4)
        client = self._create_client(config)

        # Select the appropriate image - second if available, otherwise first
        if len(image_paths) >= 2:
            source_image_path = image_paths[1]
        else:
            source_image_path = image_paths[0]
        
        # Use the source image
        image_data = self.encode_image_to_base64(source_image_path)
        
        
        prompt = """
Analyze the provided recipe image and locate the meal ingredients.
If there are multiple sets of ingredients for different serving sizes, ONLY consider the ingredients in the 4-person section.
Extract all ingredients as written, ignoring any group/headings within the ingredient list.
(A heading will not have a unit or quantity - ignore these)

Return ONLY a valid JSON array of ingredient objects with this exact structure:
[
  {
    "name": "ingredient name exactly as written",
    "quantity": "quantity exactly as written (number, fraction, or text)",
    "unit": "standardized unit",
    "optional": false
  }
]

Important:
- Extract ingredients exactly as written - do not convert quantities
- Include ALL ingredients from the 4-person section
- Ignore section headings or group labels
- For units, use standardization rules:
  * Common measurement units: keep as written (g, kg, lb, tsp, tbsp, cup, ml, l, oz, etc.)
  * Item references like "cucumber", "pack", "tin", "can", "bunch", "clove", "head", "sheet", "slice", etc. should use unit "piece"
  * If no unit is specified or unclear, use "piece"
  * pay special attention to fractions. Often written "1/2 pack pasta" meaning "Half pack pasta" other fraction examples 1/4 - quarter, 1/3 - third, 3/4 - three quarters
- Recipes may include a 'flavour pack'
  * flavour packs may have many names. examples: "veggie ragu herbs" "Italian herbs" "Taco 'bout flavour" "kiwi garlic spices"
  * the flavour pack will always be herbs, or spices, or additional flavours.
  * The flavour pack will always have a full list of ingredients, listed elsewhere on the recipe card.
  * Do not include the flavour pack in the output
  * DO include the individual ingredients of the flavour pack in the output
  * Unless stated otherwise, all flavour pack ingredients are equal parts
  * Unless stated otherwise, flavour packs are 10g in size
- Return ONLY the JSON array, no additional text
"""

        try:
            response = client.chat.completions.create(
                model=config.model,
                messages=[
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'text',
                                'text': prompt
                            },
                            {
                                'type': 'image_url',
                                'image_url': {
                                    'url': f"data:image/jpeg;base64,{image_data}"
                                }
                            }
                        ]
                    }
                ]
            )
            
            content = response.choices[0].message.content.strip()
            
            # Try to extract JSON array from the response
            start_idx = content.find('[')
            end_idx = content.rfind(']') + 1
            
            if start_idx != -1 and end_idx != -1:
                json_str = content[start_idx:end_idx]
                ingredients = json.loads(json_str)
                return ingredients
            else:
                print(f"No valid JSON array found in ingredients response: {content}")
                return None
                
        except Exception as e:
            print(f"Error in Action 4 - Extract ingredients: {e}")
            return None
    
    def action_5_combine_outputs(self, title: str, description: str, category: str, tags: List[str], instructions: List[str], ingredients: List[Dict], image_paths: List[Path], pdf_path: Path) -> Dict:
        """Action 5: Combine all outputs into the desired JSON structure."""
        
        # Create image references
        images = []
        for image_path in image_paths:
            images.append({"src": f"./{image_path.name}"})
        
        # Create the recipe object
        recipe = {
            "name": title if title else pdf_path.stem,
            "description": description if description else "",
            "category": category if category else "Dinner",
            "images": images,
            "ingredients": ingredients if ingredients else [],
            "instructions": instructions if instructions else [],
            "servings": 4,  # Default to 4 since we're extracting 4-person ingredients
            "defaultDuration": 2,
            "tags": tags if tags else []
        }
        
        # Create the full JSON structure following the template
        full_json = {
            "version": 1,
            "exportDate": datetime.utcnow().isoformat() + "Z",
            "recipes": [recipe]
        }
        
        return full_json
    
    def analyze_images_with_actions(self, image_paths: List[Path], pdf_path: Path) -> Tuple[Optional[Dict], Path]:
        """Execute all actions in sequence and combine the results."""
        
        # Action 1: Extract meal title, description, category, and tags, rename files
        print("    Action 1: Extracting meal title, description, category, and tags, renaming files...")
        title, description, category, tags, renamed_image_paths, updated_pdf_path = self.action_1_extract_meal_title(image_paths, pdf_path)
        if not title:
            print("    Warning: Failed to extract meal title")
            safe_name = pdf_path.stem
            description = ""
            category = "Dinner"
            tags = []
            updated_pdf_path = pdf_path
        else:
            print(f"    Title: {title}")
            if description:
                print(f"    Description: {description}")
            if category:
                print(f"    Category: {category}")
            if tags:
                print(f"    Tags: {', '.join(tags)}")
            safe_name = make_unix_safe_filename(title)
        
        if self.max_action and self.max_action < 2:
            return None, updated_pdf_path
        
        # Action 2: Detect bounding boxes and crop images (unless skipped)
        if self.skip_action2:
            print("    Action 2: Skipped (--skip-action2 flag set)")
            ingredients_image_path = None
            instructions_image_path = None
        else:
            print("    Action 2: Detecting bounding boxes and cropping images...")
            bounding_boxes = self.action_2_detect_bounding_boxes(renamed_image_paths)
            if not bounding_boxes:
                print("    Warning: Failed to detect bounding boxes")
                return None, updated_pdf_path
            
            ingredients_image_path, instructions_image_path = self.crop_images_from_bounding_boxes(
                renamed_image_paths, bounding_boxes, safe_name
            )
            
            if not ingredients_image_path or not instructions_image_path:
                print("    Warning: Failed to crop images")
                return None, updated_pdf_path
            
            print(f"    Cropped images: {ingredients_image_path.name}, {instructions_image_path.name}")
        
        if self.max_action and self.max_action < 3:
            return None, updated_pdf_path
        
        # Action 3: Extract instructions from cropped image
        print("    Action 3: Extracting recipe instructions...")
        instructions = self.action_3_extract_instructions(renamed_image_paths)
        if not instructions:
            print("    Warning: Failed to extract instructions")
        else:
            print(f"    Instructions: {len(instructions)} steps")
        
        if self.max_action and self.max_action < 4:
            return None, updated_pdf_path
        
        # Action 4: Extract ingredients from cropped image
        print("    Action 4: Extracting ingredients...")
        ingredients = self.action_4_extract_ingredients(renamed_image_paths)
        if not ingredients:
            print("    Warning: Failed to extract ingredients")
        else:
            print(f"    Ingredients: {len(ingredients)} items")
        
        if self.max_action and self.max_action < 5:
            return None, updated_pdf_path
        
        # Action 5: Combine outputs
        print("    Action 5: Combining outputs...")
        combined_result = self.action_5_combine_outputs(title, description, category, tags, instructions, ingredients, renamed_image_paths, updated_pdf_path)
        
        return combined_result, updated_pdf_path
    
    
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
        
        # Step 2: Analyze images with five separate actions
        print("  Analyzing images with multi-action approach...")
        recipe_json, updated_pdf_path = self.analyze_images_with_actions(image_paths, pdf_path)
        if not recipe_json:
            print(f"  Failed to extract recipe data from: {pdf_path}")
            # Clean up images on failure
            for img_path in image_paths:
                img_path.unlink(missing_ok=True)
            return False
        
        # Step 3: Save JSON
        print("  Saving recipe JSON...")
        json_path = self.save_recipe_json(recipe_json, updated_pdf_path)
        
        recipe_name = recipe_json["recipes"][0].get("name", "Unknown")
        print(f"  ✓ Completed: {json_path.name}")
        print(f"    Recipe: {recipe_name}")
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
        print(f"Default config: {self.default_config.base_url} - {self.default_config.model}")
        if self.action_configs:
            for action, config in self.action_configs.items():
                print(f"Action {action} config: {config.base_url} - {config.model}")
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
        description="Convert PDF recipes to JSON using OpenAI-compatible API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Use default Ollama local setup
  python pdf_to_recipe.py /path/to/pdfs
  
  # Use OpenRouter for all actions
  python pdf_to_recipe.py /path/to/pdfs --api-key YOUR_KEY --base-url https://openrouter.ai/api/v1 --model openai/gpt-4-vision-preview
  
  # Mixed configuration: Ollama default, OpenRouter for action 2
  python pdf_to_recipe.py /path/to/pdfs --action2-base-url https://openrouter.ai/api/v1 --action2-api-key YOUR_KEY --action2-model anthropic/claude-3-haiku
        """
    )
    
    # Required argument
    parser.add_argument(
        "directory",
        help="Directory containing PDF files to process"
    )
    
    # Action limit flag
    parser.add_argument(
        "--max-action",
        type=int,
        choices=[1, 2, 3, 4, 5],
        help="Maximum action to execute (1-5). Actions run sequentially, this limits how far to go."
    )
    
    # Skip action 2 flag
    parser.add_argument(
        "--skip-action2",
        action="store_true",
        help="Skip Action 2 (bounding box detection and image cropping). Actions 3 and 4 will use original images."
    )
    
    # Default configuration
    parser.add_argument(
        "--api-key",
        default="ollama",
        help="Default API key (default: ollama)"
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:11434/v1",
        help="Default base URL (default: http://localhost:11434/v1)"
    )
    parser.add_argument(
        "--model",
        default="gemma3:12b",
        help="Default model (default: gemma3:12b)"
    )
    
    # Action 1 specific configuration
    parser.add_argument(
        "--action1-api-key",
        help="API key for Action 1 (extract meal title)"
    )
    parser.add_argument(
        "--action1-base-url",
        help="Base URL for Action 1"
    )
    parser.add_argument(
        "--action1-model",
        help="Model for Action 1"
    )
    
    # Action 2 specific configuration
    parser.add_argument(
        "--action2-api-key",
        help="API key for Action 2 (detect bounding boxes)"
    )
    parser.add_argument(
        "--action2-base-url",
        help="Base URL for Action 2"
    )
    parser.add_argument(
        "--action2-model",
        help="Model for Action 2"
    )
    
    # Action 3 specific configuration
    parser.add_argument(
        "--action3-api-key",
        help="API key for Action 3 (extract instructions)"
    )
    parser.add_argument(
        "--action3-base-url",
        help="Base URL for Action 3"
    )
    parser.add_argument(
        "--action3-model",
        help="Model for Action 3"
    )
    
    # Action 4 specific configuration
    parser.add_argument(
        "--action4-api-key",
        help="API key for Action 4 (extract ingredients)"
    )
    parser.add_argument(
        "--action4-base-url",
        help="Base URL for Action 4"
    )
    parser.add_argument(
        "--action4-model",
        help="Model for Action 4"
    )
    
    args = parser.parse_args()
    
    try:
        # Create default configuration
        default_config = OpenAIConfig(
            api_key=args.api_key,
            base_url=args.base_url,
            model=args.model
        )
        
        # Create action-specific configurations
        action_configs = {}
        
        # Action 1 configuration
        if any([args.action1_api_key, args.action1_base_url, args.action1_model]):
            action_configs[1] = OpenAIConfig(
                api_key=args.action1_api_key or args.api_key,
                base_url=args.action1_base_url or args.base_url,
                model=args.action1_model or args.model
            )
        
        # Action 2 configuration
        if any([args.action2_api_key, args.action2_base_url, args.action2_model]):
            action_configs[2] = OpenAIConfig(
                api_key=args.action2_api_key or args.api_key,
                base_url=args.action2_base_url or args.base_url,
                model=args.action2_model or args.model
            )
        
        # Action 3 configuration
        if any([args.action3_api_key, args.action3_base_url, args.action3_model]):
            action_configs[3] = OpenAIConfig(
                api_key=args.action3_api_key or args.api_key,
                base_url=args.action3_base_url or args.base_url,
                model=args.action3_model or args.model
            )
        
        # Action 4 configuration
        if any([args.action4_api_key, args.action4_base_url, args.action4_model]):
            action_configs[4] = OpenAIConfig(
                api_key=args.action4_api_key or args.api_key,
                base_url=args.action4_base_url or args.base_url,
                model=args.action4_model or args.model
            )
        
        # Create and run processor
        processor = PDFRecipeProcessor(args.directory, default_config, action_configs, args.max_action, args.skip_action2)
        processor.process_all()
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()