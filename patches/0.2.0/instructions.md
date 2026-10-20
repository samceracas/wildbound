# State: Not Implemented
# Overview
On this update, we will be adding a creature manager app which will help us brainstorm and add new creatures to wildbound that fit the lore and theme. This app will be AI assisted using one of the llms from groq to read context on what wildbound is (refer files from `docs` folder to give context) and assist in creating these new wildkin.


# Wildbound creature manager
- create another application within this monorepo with similar tech stack as the web app.
- The creature manager will be the application to manage the creature information
  - Think sort of like the `docs/WILDBOUND_Wildkin_Bible_v1.1.docx` (an encyclopedia basically) but you can manage them in an app and convert them to game data on the Creatures table
    - Maybe you can create a new table maybe to reflect the bible information and then have the game related information be reflected on the Creatures table
  - Creating entries would allow drafting one and publishing one
- There should be a dashboard page showing cards that show the number of wildkin there are on the database. This will be extended a bit later.
- There should be a page for listing available wildkin with icons, registry number, and name displayed
  - There should also be a create button which will redirect us to the wildkin creation/modification page
  - On each row, there should be an edit and delete button. Delete button will soft delete the entries.
- Integrate an LLM to assist the user in creating a lore/story aligned wildkin on the creation/modification page.
  - The LLM must be fed with context on what wildbound is in order to make more aligned data for new wildkin.
  - Think of a form for adding/modifying wildkin with the usual inputs (if there are choices for each property, make it a selectable combobox, etc to make it easier to select data) and also a prompt that will autofill the needed inputs based on the general idea.
- There should be a button that will generate the sprites/icons for the new wildkin using the pixellab mcp. Pass in the necessary encyclopedia information to make a more aligned wildkin according to the physical description.
- Add the necessary run commands on the package.json


# Wildbound editor
- if it's not already implemented, the list of wildkin should be read from the database so that when a new creature is added, we would be able to select them and do the necessary configuration

# Wildbound app
- Make the spawned wildkin move around at certain intervals. If it goes out of bounds within the `spawnRadiusM`, despawn them. Make their movements random, like animals moving around randomly or according to their behavior. 
  - This may be removed in the future if it feels a bit clunky. I will be testing it once `0.2.0` is already implemented. I will be making a decision by `0.3.0`

# Implementation notes
- Update this file state to "Implemented" when all of the requirements listed above are implemented.
- Update the necessary documentations especially the ones at `docs` folder
- If this requires multiple passes, don't update yet the state of this file.
  - Every after pass, create the handover files just within this folder and add in the necessary implementation details as a prompt to be executed on a clear session. If ready to clear, say "Ready to clear".
- Ask any questions before implementing if things are not clear.
- Use the cheapest available pixellab algorithm. Always check the remaining credits before doing the generation.
- Use multiple agents in parallel to delegate certain tasks.