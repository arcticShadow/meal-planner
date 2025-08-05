# Menu Planner - Project Brief

## Core Vision
A fully offline web application for meal planning and recipe management that enables users to organize recipes, plan meals for future dates, and generate consolidated shopping lists.

## Primary Goals
1. **Offline-First Architecture**: Complete functionality without internet dependency using local browser database
2. **Recipe Management**: Add recipes manually via forms and import from structured JSON files
3. **Meal Planning**: Schedule meals for future dates with intelligent date prioritization
4. **Shopping List Generation**: Automatic ingredient consolidation with meal/date tracking
5. **Data Portability**: Full database export/import capabilities
6. **Multi-User Collaboration**: Browser-to-browser sync for shared meal planning

## Key Requirements

### Recipe Library
- Manual recipe entry through forms
- JSON file import with explicit structure
- Browse and search functionality
- Local database storage

### Meal Planning
- Assign meals to any future date
- Prioritize closest unallocated dates
- Default 2-day meal duration (configurable per meal)
- Visual calendar interface

### Shopping List Management
- Automatic ingredient aggregation from selected meals
- Ingredient tagging with meal and date information
- Expandable view showing ingredient breakdown by meal
- Optional ingredient exclusion during meal selection

### Data Management
- Complete database export for backup
- Database import for restoration
- Browser-to-browser sync protocol
- Real-time collaboration on meal plans and recipe libraries

## Success Criteria
- Fully functional offline operation
- Intuitive meal planning workflow
- Accurate shopping list generation
- Reliable data sync between users
- Seamless import/export functionality

## Technical Constraints
- Must work entirely in browser
- No server dependencies for core functionality
- Cross-browser compatibility required
- Responsive design for mobile/desktop use