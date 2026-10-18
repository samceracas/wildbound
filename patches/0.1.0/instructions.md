# State: Not implemented
# Overview
I just added new agentic skills to the root project on the main​ branch. I want to change how I want to work with this project since i'm a bit overwhelmed with life right now. I want to brush up my react, node.js, express.js, prisma skills, tailwind css, tanstack query, postgresql, zod, react-hook-form. Right now the tech stack isn't standardized. Change the tech stack for the map editor, the web app, and api to follow what I mentioned. Keep existing stack for the location related features as-is. Think creating creating the whole wildbound editor, api, and web game v0.1.0 (just the basics) but with parts that are unfinished for me to implement or like a "fill in the blanks" but with full/partial features/snippets missing that I need to implement. You can add comments on the code on what needs to be implemented on my end for each feature missing so I could follow through with the implementation manually. For the editor, i like it as is but with some improvements.

# Wildbound editor implementation/feedback:
- I like the whole region/POI publishing with encounter tables but it's currently not secured and anyone could input any coordinates to sort of "skip" or jump to certain areas. I want this to be secured on here as well as on the web app.

This is currently the feedback that I have for the editor. The editor looks nice. Thanks :D 

# Wildbound app
- On initial load, I want the user to be prompted a username. This will keep track of the saved data for the user.
- I also want the user to be prompted to allow location sharing on another screen before we get to load the game. Do not let the user get into the game screen without location sharing activated. If deactivated on the game screen, disable the game for a moment until it's re-activated again.
- Implement the encounter tables so we'll get to see the wildkin being spawned within the user's location, weather, and time of day. Wildkin should be shown on the map as icons that we could click. On click, would show 2 actions. Observe and Capture. Observe will only unlock the Registry information about the wildkin such as the name, description, habitat and the registry number for that wildkin. For other aspects such as skills, these will be unlocked through capture. Registry should look similar to pokemon pokedex.
- Implement the Registry where we will see a list of wildkin. Only unlocked wildkin will show the full icon while others that are not locked will only show a silhouette plus the registry number (think of pokemon pokedex UI).
- Build the time system with the user's local time.
- Build the weather system by fetching the local weather within the user's location.
- Both weather and time system will affect the encounter tables so different kinds of pokemon will spawn on different times of the day and weather. Some other pokemon might spawn more on certain types of weather and spawn less or non on others. Similar aspect for the time of day.
- Use pixellab mcp to generate the icons (think showing only the face of the character/wildkin) and the wildkin sprites (this is shows the detailed look of the wildkin). Use the `documents/WILDBOUND_Wildkin_Bible_v1.1.docx` to get the full description on what they should look like, and in general what wildkins are and how to generate them through pixellab.
- The player location should be shown as a player icon, (think of like a player head). Use pixellab to generate this
- For the whole UI, i have integrated google stitch 2.0 and generated the mockups for the login screen -> allow location sharing screen -> radar, registry, inventory, party. Use the prompt below to download the mockups:
```
## Stitch Instructions

Get the images and code for the following Stitch project's screens:

## Project
Title: Wildbound Design System
ID: 10056911725099997677

## Screens:
1. Login
    ID: 3b2371ca6ac94485a17b1b46780de550

2. Allow Location Sharing
    ID: 5c4d27f9208f4f489f7568f7a47cd5a8

3. Radar
    ID: 7a3785983cb84ea7b285ec377f28b6cc

4. Inventory
    ID: 3939552b21024c39a31e671470409461

5. Registry
    ID: c60e00288fab46a1ab5fb25cd5d561c3

6. Party
    ID: ca65ef18aad34a288cd8d4772a0e45ba

Use a utility like `curl -L` to download the hosted URLs.
```

# Implementation notes
- Update this file state to "Implemented" when all of the requirements listed above are implemented.
- Update the necessary documentations
- If this requires multiple passes, don't update yet the state of this file.
  - Every after pass, create the handover files just within this folder and add in the necessary implementation details as a prompt to be executed on a clear session.
- Ask any questions before implementing if things are not clear.
- Use the cheapest available pixellab algorithm. Always check the remaining credits before doing the generation.