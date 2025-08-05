# PDF Recipe Processor

A standalone Python script that converts PDF recipe files to structured JSON using AI analysis via Ollama.

## Features

- **Automatic Discovery**: Finds PDFs without accompanying JPG/JSON files
- **PDF to Image Conversion**: Converts single or multi-page PDFs to high-quality JPG images
- **AI Recipe Analysis**: Uses Ollama with gemma2:4b model to extract recipe information
- **Structured Output**: Generates JSON files following the menu-planner recipe schema
- **File Management**: Saves JPGs and JSON alongside original PDFs

## Requirements

### System Dependencies
```bash
# macOS (using Homebrew)
brew install poppler

# Ubuntu/Debian
sudo apt-get install poppler-utils

# CentOS/RHEL
sudo yum install poppler-utils
```

### Python Dependencies
```bash
pip install pdf2image pillow requests ollama
```

### Ollama Setup
1. Install Ollama: https://ollama.ai/
2. Start Ollama server:
   ```bash
   ollama serve
   ```
3. Pull the required model:
   ```bash
   ollama pull gemma2:4b
   ```

## Usage

### Basic Usage
```bash
python pdf_to_recipe.py /path/to/pdf/directory
```

### With Custom Model
```bash
python pdf_to_recipe.py /path/to/pdf/directory --model llama2:7b
```

### Command Line Options
- `directory`: Path to directory containing PDF files (required)
- `--model`: Ollama model to use (default: gemma2:4b)

## How It Works

1. **Scan Directory**: Finds all PDF files that don't have accompanying `.jpg` or `.json` files
2. **Convert PDFs**: Uses `pdf2image` to convert each page to a high-quality JPG image
3. **AI Analysis**: Sends images to Ollama API with a detailed prompt to extract recipe information
4. **Generate JSON**: Creates structured JSON following the menu-planner recipe schema
5. **Save Files**: Saves both images and JSON alongside the original PDF

## Output Structure

For a PDF named `chocolate_cake.pdf`, the script generates:
- `chocolate_cake.jpg` (or `chocolate_cake_page1.jpg`, `chocolate_cake_page2.jpg` for multi-page)
- `chocolate_cake.json` (recipe data in menu-planner format)

### Generated JSON Schema
```json
{
  "version": 1,
  "exportDate": "2025-01-01T00:00:00.000Z",
  "recipes": [
    {
      "name": "Recipe Name",
      "description": "Recipe description",
      "images": [{"src": "./image.jpg"}],
      "ingredients": [
        {
          "name": "ingredient name",
          "quantity": 2,
          "unit": "cup",
          "optional": false
        }
      ],
      "instructions": ["Step 1", "Step 2"],
      "servings": 4,
      "defaultDuration": 2,
      "tags": ["tag1", "tag2"],
      "category": "Main Course",
      "prepTime": 15,
      "cookTime": 30
    }
  ]
}
```

## Example Workflow

```bash
# Directory before processing
recipes/
├── chocolate_cake.pdf
├── pasta_recipe.pdf
└── existing_recipe.pdf
└── existing_recipe.jpg    # This PDF will be skipped

# Run the script
python pdf_to_recipe.py recipes/

# Directory after processing
recipes/
├── chocolate_cake.pdf
├── chocolate_cake.jpg
├── chocolate_cake.json
├── pasta_recipe.pdf
├── pasta_recipe_page1.jpg
├── pasta_recipe_page2.jpg
├── pasta_recipe.json
├── existing_recipe.pdf
└── existing_recipe.jpg    # Unchanged
```

## Error Handling

- **Missing Dependencies**: Script checks for required packages and provides installation instructions
- **Ollama Connection**: Validates Ollama server is running and model is available
- **PDF Conversion Errors**: Logs conversion failures and continues with other files
- **AI Analysis Failures**: Handles malformed responses and JSON parsing errors
- **File System Errors**: Manages permissions and disk space issues

## Troubleshooting

### "Cannot connect to Ollama"
1. Ensure Ollama is installed and running: `ollama serve`
2. Check if the service is running on port 11434
3. Verify the model is installed: `ollama list`

### "Model not found"
```bash
ollama pull gemma2:4b
```

### "PDF conversion failed"
1. Ensure poppler-utils is installed
2. Check PDF file is not corrupted
3. Verify sufficient disk space

### "No valid JSON found in response"
- The AI model may have issues with complex recipe layouts
- Try with a different model using `--model` parameter
- Check if the PDF contains clear, readable recipe text

## Performance Notes

- Processing time depends on PDF complexity and number of pages
- Typical processing: 30-60 seconds per PDF
- Image conversion: ~5-10 seconds per page
- AI analysis: ~20-40 seconds per recipe
- Memory usage: ~100-500MB during processing

## Limitations

- Requires clear, readable recipe text in PDFs
- Best results with standard recipe formats
- Handwritten recipes may have lower accuracy
- Complex layouts or decorative fonts may cause extraction issues
- Requires stable internet connection for Ollama API calls (if using remote models)

## Integration with Menu Planner

The generated JSON files can be directly imported into the menu planner application:

1. Open the menu planner application
2. Navigate to Settings → Data Management
3. Use "Import Recipes" to load the generated JSON files
4. The recipes will be added to your recipe library with associated images