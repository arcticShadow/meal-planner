This is a new project directory. 

I want to create an web applicaton that can

* be fully offline - managing its own data in a local browser database
* have ability to 'add' a recipie (manually, via a form)to the library of recipies (stored in the local database) 
* ability to 'load' recipies into the library by reading json files that follow an explicit strcuture. 
* ability to browse and search the library
* ability to plan meals for future dates (meal can be allocated to any date - but closest unallocated dates are prioritised) 
* Selected meals will default to cover 2 days - but the number of days a meals is suitable for is configurable per meal
* All selected meals should sync there ingredients to a common shopping list. 
* At time of selecting a meal, ingredients may be unselected, so they are not included in the common shopping list. 
* All ingredients in the common shopping list are tagged to indicate the meal they are for, and the day they are for - this means if i have 600g chicken for a Chicken curry on monday - and 600g for chicken burgers on wednesday, then I will see 1200g chicken in the commmon list, but this will be expandable to see the two 600g entiries. 
* The entire database should be able to be exported for safe keeping, and reimported later if required, 
* the database should be able to be 'shared' with other users through a sync mechanisim in a browser to browser protocol. this will allow two users to plan meals, and both to see what each other have included on the plan. it will also allow syncing of the library of recipies, and syncing of the common shopping list. 