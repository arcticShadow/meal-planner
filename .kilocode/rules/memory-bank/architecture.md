# Menu Planner - Architecture

## System Architecture Overview

### Core Architecture Pattern
**Client-Side Only Architecture** - Single Page Application (SPA) with no server dependencies for core functionality.

### Data Layer
- **Primary Storage**: IndexedDB for persistent local storage
- **Secondary Storage**: LocalStorage for user preferences and settings
- **Data Structure**: Normalized database schema with relationships between recipes, meals, and shopping lists

### Application Layers
1. **Presentation Layer**: UI components and user interactions
2. **Business Logic Layer**: Meal planning algorithms, ingredient consolidation, date management
3. **Data Access Layer**: IndexedDB operations, import/export functionality
4. **Sync Layer**: Browser-to-browser communication protocol

## Database Schema Design

### Core Entities
```
Recipes
- id (primary key)
- name
- description
- ingredients (array of ingredient objects)
- instructions
- servings
- defaultDuration (days)
- tags
- createdAt
- updatedAt

Meals
- id (primary key)
- recipeId (foreign key)
- scheduledDate
- duration (days)
- excludedIngredients (array)
- createdAt

ShoppingListItems
- id (primary key)
- ingredient
- quantity
- unit
- mealIds (array of meal IDs)
- dates (array of dates)
- consolidated (boolean)
```

## Key Components

### Recipe Management
- **RecipeLibrary**: Browse, search, and manage recipes
- **RecipeForm**: Add/edit recipes manually
- **RecipeImporter**: JSON file import with validation
- **RecipeExporter**: Export recipes to JSON

### Meal Planning
- **MealCalendar**: Visual calendar interface for meal scheduling
- **DateSelector**: Smart date suggestion algorithm
- **MealScheduler**: Assign recipes to dates with duration management

### Shopping List
- **IngredientAggregator**: Consolidate ingredients across meals
- **ShoppingListView**: Display consolidated shopping list
- **IngredientBreakdown**: Expandable view showing meal/date details

### Data Management
- **DatabaseManager**: IndexedDB operations and schema management
- **DataExporter**: Full database export functionality
- **DataImporter**: Database restoration from exports
- **SyncManager**: Browser-to-browser synchronization

## Browser-to-Browser Sync Protocol

### Sync Architecture
- **WebRTC Data Channels**: Direct peer-to-peer communication
- **Conflict Resolution**: Last-write-wins with timestamp comparison
- **Sync Events**: Real-time updates for recipes, meals, and shopping lists

### Sync Flow
1. **Discovery**: QR code or shared link for initial connection
2. **Handshake**: Establish WebRTC connection
3. **Data Exchange**: Bidirectional sync of all entities
4. **Live Updates**: Real-time propagation of changes

## File Structure (Planned)
```
/src
  /components
    /recipe
    /meal-planning
    /shopping-list
    /sync
  /services
    /database
    /sync
    /import-export
  /utils
    /date-helpers
    /ingredient-parser
  /styles
/public
  index.html
  manifest.json (PWA support)
```

## Critical Implementation Paths

### Phase 1: Core Functionality
1. IndexedDB setup and basic CRUD operations
2. Recipe management (add, edit, browse)
3. Basic meal planning interface
4. Shopping list generation

### Phase 2: Advanced Features
1. JSON import/export functionality
2. Advanced search and filtering
3. Calendar-based meal planning
4. Ingredient consolidation with breakdown

### Phase 3: Collaboration
1. Data export/import for backup
2. Browser-to-browser sync implementation
3. Real-time collaboration features

## Design Patterns

### Data Management
- **Repository Pattern**: Abstract data access operations
- **Observer Pattern**: Real-time UI updates when data changes
- **Command Pattern**: Undo/redo functionality for meal planning

### UI Architecture
- **Component-Based**: Modular, reusable UI components
- **State Management**: Centralized application state
- **Event-Driven**: Loose coupling between components

## Performance Considerations
- **Lazy Loading**: Load recipes and meals on demand
- **Virtual Scrolling**: Handle large recipe libraries efficiently
- **Debounced Search**: Optimize search performance
- **Offline Caching**: Ensure instant startup without network