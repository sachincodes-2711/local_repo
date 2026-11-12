const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());

const pendingRequests = {}; 
let currentPending = null; 

const manifest = {
    id: "com.personal.remote.stream",
    version: "4.0.0",
    name: "Native App Handoff",
    description: "Waits for phone to fetch links for Movies and Series.",
    resources: ["stream"],
    // 1. ADD SERIES TO MANIFEST
    types: ["movie", "series"], 
    idPrefixes: ["tt", "tmdb:"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(({ type, id }) => {
    if (type === "movie" || type === "series") {
        // 2. PARSE THE STREMIO ID (e.g., tt1234567:1:2)
        const parts = id.split(":");
        const cleanId = parts[0]; 
        const season = parts[1] || null;
        const episode = parts[2] || null;

        return new Promise((resolve) => {
            console.log(`Stremio requested ${type} ${id}. Waiting for phone...`);
            
            // Save all the data so the Android app can read it
            currentPending = {
                stremioId: id, // The exact ID Stremio needs back
                cleanId: cleanId,
                type: type,
                season: season,
                episode: episode
            };
            
            pendingRequests[id] = (videoUrl) => {
                console.log(`Link received! Sending stream to Stremio.`);
                resolve({
                    streams: [{
                        title: "Stealth Stream\n1080p",
                        url: videoUrl
                    }]
                });
            };

            setTimeout(() => {
                if (pendingRequests[id]) {
                    console.log("Timeout waiting for phone.");
                    delete pendingRequests[id];
                    if (currentPending && currentPending.stremioId === id) currentPending = null;
                    resolve({ streams: [] }); 
                }
            }, 60000);
        });
    }
    return Promise.resolve({ streams: [] });
});

app.use("/", getRouter(builder.getInterface()));

app.get("/pending", (req, res) => {
    // Send the JSON object to the phone
    res.json(currentPending || {});
});

app.get("/push", (req, res) => {
    const id = req.query.id; // This will now receive the full 'tt12345:1:2'
    const videoUrl = req.query.url;
    
    if (pendingRequests[id]) {
        pendingRequests[id](videoUrl); 
        delete pendingRequests[id];
        currentPending = null;
        res.send("Success");
    } else {
        res.send("Error: Timeout or invalid ID");
    }
});

const port = process.env.PORT || 7000;
app.listen(port, () => console.log(`Server running on port ${port}`));
