# PDF Recipe Processor

A standalone Python script that converts PDF recipe files to structured JSON using AI analysis via OpenAI-compatible APIs.

## Features

- **Automatic Discovery**: Finds PDFs without accompanying JPG/JSON files
- **PDF to Image Conversion**: Converts single or multi-page PDFs to high-quality JPG images
- **AI Recipe Analysis**: Uses OpenAI-compatible APIs with configurable models per action
- **Four-Action Approach**: Separate AI calls for title, instructions, ingredients, and final JSON assembly
- **Flexible Configuration**: Per-action API configuration with fallback to defaults
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
pip install -r requirements.txt
# or manually:
pip install pdf2image pillow requests openai
```

### API Setup Options

#### Option 1: Local Ollama (Default)
1. Install Ollama: https://ollama.ai/
2. Start Ollama server:
   ```bash
   ollama serve
   ```
3. Pull a vision-capable model:
   ```bash
   ollama pull gemma3:12b
   # or other models like llava, minicpm-v, etc.
   ```

#### Option 2: OpenRouter
1. Get API key from https://openrouter.ai/
2. Use with `--api-key` and `--base-url` flags

#### Option 3: Other OpenAI-Compatible APIs
Configure base URL and API key as needed

## Usage

### Basic Usage (Local Ollama)
```bash
python pdf_to_recipe.py /path/to/pdf/directory
```

### OpenRouter Configuration
```bash
python pdf_to_recipe.py /path/to/pdf/directory \
  --api-key "sk-or-..." \
  --base-url "https://openrouter.ai/api/v1" \
  --model "openai/gpt-4-vision-preview"
```

### Mixed Configuration Example
```bash
# Use Ollama by default, but OpenRouter for ingredient extraction (Action 3)
python pdf_to_recipe.py /path/to/pdf/directory \
  --action3-api-key "sk-or-..." \
  --action3-base-url "https://openrouter.ai/api/v1" \
  --action3-model "anthropic/claude-3-haiku"
```

### Command Line Options

#### Global Configuration
- `directory`: Path to directory containing PDF files (required)
- `--api-key`: Default API key (default: "ollama")
- `--base-url`: Default base URL (default: "http://localhost:11434/v1")
- `--model`: Default model (default: "gemma3:12b")

#### Per-Action Configuration
Each action can be configured independently:

**Action 1 (Extract Meal Title):**
- `--action1-api-key`: API key for Action 1
- `--action1-base-url`: Base URL for Action 1
- `--action1-model`: Model for Action 1

**Action 2 (Extract Instructions):**
- `--action2-api-key`: API key for Action 2
- `--action2-base-url`: Base URL for Action 2
- `--action2-model`: Model for Action 2

**Action 3 (Extract Ingredients):**
- `--action3-api-key`: API key for Action 3
- `--action3-base-url`: Base URL for Action 3
- `--action3-model`: Model for Action 3

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

### "Could not verify API connection"
**For Local Ollama:**
1. Ensure Ollama is installed and running: `ollama serve`
2. Check if the service is running on port 11434
3. Verify a vision-capable model is installed: `ollama list`
4. Pull a model if needed: `ollama pull gemma3:12b`

**For OpenRouter/Remote APIs:**
1. Verify API key is correct
2. Check base URL is properly formatted
3. Ensure you have credits/access to the specified model
4. Test with a simple curl command first

### "Model not found" or "Model access denied"
**Local Ollama:**
```bash
ollama pull gemma3:12b
# or other vision models like:
ollama pull llava
ollama pull minicpm-v
```

**Remote APIs:**
- Check model name is correct for the provider
- Verify your API key has access to vision models
- Some models may require special permissions

### "PDF conversion failed"
1. Ensure poppler-utils is installed
2. Check PDF file is not corrupted
3. Verify sufficient disk space
4. Try with a simpler PDF first

### "No valid JSON found in response"
- The AI model may have issues with complex recipe layouts
- Try with a different model using per-action configuration
- Check if the PDF contains clear, readable recipe text
- Some models work better for ingredients vs instructions

### Configuration Examples for Common Issues

**High accuracy for ingredients:**
```bash
python pdf_to_recipe.py /path/to/pdfs \
  --action3-model "anthropic/claude-3-haiku"
```

**Faster processing with mixed models:**
```bash
python pdf_to_recipe.py /path/to/pdfs \
  --action1-model "gemma3:12b" \
  --action2-model "gemma3:12b" \
  --action3-api-key "sk-or-..." \
  --action3-base-url "https://openrouter.ai/api/v1" \
  --action3-model "openai/gpt-4-vision-preview"
```

## Performance Notes

- Processing time depends on PDF complexity and number of pages
- Typical processing: 30-60 seconds per PDF with local models
- Image conversion: ~5-10 seconds per page
- AI analysis: ~10-30 seconds per action (varies by model and provider)
- Memory usage: ~100-500MB during processing
- Remote APIs may be faster but require internet connection

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