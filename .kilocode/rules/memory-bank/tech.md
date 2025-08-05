# Menu Planner - Technology Stack

## Core Technologies

### Frontend Framework
**Decision**: Svelte with SvelteKit
**Rationale**: 
- Compile-time optimizations result in smaller bundle sizes
- Excellent performance for offline-first applications
- Simple, intuitive component syntax
- Built-in reactivity without virtual DOM overhead
- Great developer experience with minimal boilerplate
- Static site generation capabilities for offline deployment

### CSS Framework
**Decision**: Skeleton CSS (getskeleton.com)
**Rationale**:
- Lightweight (~400 lines of CSS)
- Mobile-first responsive grid system
- Clean, minimal design philosophy
- Easy to customize and extend
- Perfect for rapid prototyping
- No JavaScript dependencies

### Database
**Primary**: IndexedDB with Dexie.js wrapper
**Secondary**: LocalStorage for preferences
**Rationale**:
- IndexedDB provides robust offline storage with transactions
- Dexie.js simplifies IndexedDB operations with Promise-based API
- Supports complex queries and indexing
- Large storage capacity (limited by available disk space)

### Build Tools
**Development**: Vite (included with SvelteKit)
**Production**: SvelteKit static adapter for static site generation
**Rationale**:
- Fast development server with hot module replacement
- Optimized production builds
- Static site generation maintains offline-first principle
- Tree-shaking eliminates unused code

## Key Libraries

### Essential Dependencies
- **Dexie.js**: IndexedDB wrapper for database operations
- **Date-fns**: Date manipulation and formatting (lightweight alternative to Moment.js)
- **Svelte**: Core framework
- **SvelteKit**: Full-stack framework with static adapter

### Optional Enhancements
- **Fuse.js**: Fuzzy search for recipe library
- **Lucide Svelte**: Icon library for Svelte
- **QR Code Generator**: For sync link sharing

## Browser-to-Browser Sync Technology

### WebRTC Implementation
- **RTCDataChannel**: Direct peer-to-peer data transfer
- **Simple-peer**: WebRTC wrapper for easier implementation
- **Connection Discovery**: QR codes with connection strings

### Sync Protocol
- **Message Format**: JSON with operation types (CREATE, UPDATE, DELETE)
- **Conflict Resolution**: Timestamp-based last-write-wins
- **Real-time Updates**: Svelte stores for reactive UI updates

## File Structure

```
/
├── package.json              # Dependencies and scripts
├── svelte.config.js          # Svelte configuration
├── vite.config.js           # Vite configuration
├── app.html                 # HTML template
├── /src
│   ├── app.html             # App shell
│   ├── /routes              # SvelteKit routes
│   │   ├── +layout.svelte   # Main layout
│   │   ├── +page.svelte     # Home page
│   │   ├── /recipes         # Recipe management routes
│   │   ├── /planning        # Meal planning routes
│   │   └── /shopping        # Shopping list routes
│   ├── /lib                 # Reusable components and utilities
│   │   ├── /components      # Svelte components
│   │   │   ├── RecipeCard.svelte
│   │   │   ├── MealCalendar.svelte
│   │   │   ├── ShoppingList.svelte
│   │   │   └── SyncManager.svelte
│   │   ├── /services        # Business logic services
│   │   │   ├── database.js  # IndexedDB operations
│   │   │   ├── recipeService.js
│   │   │   ├── mealService.js
│   │   │   ├── shoppingService.js
│   │   │   └── syncService.js
│   │   ├── /stores          # Svelte stores for state management
│   │   │   ├── recipes.js
│   │   │   ├── meals.js
│   │   │   ├── shopping.js
│   │   │   └── sync.js
│   │   └── /utils           # Utility functions
│   │       ├── dateHelpers.js
│   │       ├── ingredientParser.js
│   │       └── validators.js
│   └── /styles
│       ├── app.css          # Global styles and Skeleton CSS imports
│       └── components.css   # Component-specific styles
├── /static                  # Static assets
│   ├── favicon.ico
│   ├── manifest.json        # PWA manifest
│   └── /icons              # Application icons
└── /build                  # Generated static files (after build)
```

## Development Setup

### Initial Setup
```bash
npm create svelte@latest menu-planner
cd menu-planner
npm install
npm install dexie date-fns
npm install -D @types/node
```

### Skeleton CSS Integration
```bash
# Add Skeleton CSS via CDN or npm
npm install skeleton-css
# Or include via CDN in app.html
```

### Development Commands
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # Type checking
```

### SvelteKit Configuration
- **Adapter**: `@sveltejs/adapter-static` for static site generation
- **Prerender**: Enable for all routes to ensure offline functionality
- **Trailing Slash**: Configure for consistent routing

## Browser Compatibility
- **Primary Targets**: Chrome 80+, Firefox 75+, Safari 13+, Edge 80+
- **Required Features**: IndexedDB, WebRTC, ES6 modules
- **Svelte Support**: Modern browsers with ES6+ support

## Performance Considerations

### Svelte Optimizations
- **Compile-time optimizations**: Svelte eliminates runtime overhead
- **Code splitting**: SvelteKit automatically splits code by route
- **Tree shaking**: Unused code eliminated during build
- **Reactive updates**: Only update DOM when data actually changes

### Database Optimizations
- **Lazy loading**: Load data on demand using Svelte stores
- **Virtual scrolling**: Handle large lists efficiently
- **Debounced search**: Prevent excessive database queries
- **Indexed queries**: Optimize database performance with proper indexing

## State Management

### Svelte Stores
- **Writable stores**: For mutable application state
- **Derived stores**: For computed values
- **Custom stores**: For complex business logic
- **Persistent stores**: Sync with IndexedDB for data persistence

### Store Structure
```javascript
// recipes.js - Recipe management store
// meals.js - Meal planning store  
// shopping.js - Shopping list store
// sync.js - Browser-to-browser sync store
```

## PWA Features
- **Service Worker**: SvelteKit can generate service worker
- **Web App Manifest**: Configure in static/manifest.json
- **Offline Support**: Static site works offline by default
- **Install Prompt**: Native app installation capability

## Deployment Options
- **Static Hosting**: Netlify, Vercel, GitHub Pages
- **Self-Hosting**: Any web server for static files
- **Local Development**: Runs on localhost during development

## UI/UX Best Practices

### Skeleton CSS Framework Usage
- **Always use existing Skeleton classes**: Prefer `button`, `button-outline`, `card`, `badge`, `alert` over custom CSS
- **Semantic HTML first**: Use proper HTML elements (`header`, `footer`, `section`, `article`, `fieldset`, `legend`)
- **Minimal custom CSS**: Only add custom styles when absolutely necessary for layout or responsive behavior
- **Consistent typography**: Use semantic headings (h1-h6) and let Skeleton handle the styling

### Component Architecture
- **Semantic structure**: Use proper HTML5 semantic elements for better accessibility and meaning
- **Inline styles for layout**: Use inline styles for layout-specific positioning rather than custom CSS classes
- **Skeleton grid system**: Leverage `.row`, `.column`, `.column-50`, etc. for responsive layouts
- **Alert components**: Use `.alert`, `.alert-error`, `.alert-success`, `.alert-warning` for user feedback

### Styling Guidelines
- **Color consistency**: Use Skeleton's color palette (#9b4dca for primary, #606c76 for text, #e85600 for errors)
- **Spacing**: Follow Skeleton's spacing conventions (rem units, consistent margins/padding)
- **Responsive design**: Use Skeleton's breakpoints (@media max-width: 40rem) for mobile-first design
- **Form styling**: Let Skeleton handle form element styling, only add error states when needed

### Lessons Learned
- Custom CSS should be minimal and focused on layout/positioning only
- Semantic HTML provides better structure and accessibility than div-heavy layouts
- Skeleton's built-in classes handle most styling needs effectively
- Inline styles are acceptable for component-specific layout requirements
- Always prioritize framework consistency over custom styling