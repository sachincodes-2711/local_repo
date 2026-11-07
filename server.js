const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());

const pendingRequests = {}; 
let currentPendingId = null; 

const manifest = {
    id: "com.personal.remote.stream",
    version: "3.0.0",
    name: "Native App Handoff",
    description: "Waits for phone to fetch the link before showing stream.",
    resources: ["stream"],
    types: ["movie"],
    idPrefixes: ["tt", "tmdb:"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(({ type, id }) => {
    if (type === "movie") {
        const cleanId = id.split(":")[1] || id; 
        
        // Return a Promise that stays unresolved until the phone sends the URL
        return new Promise((resolve) => {
            console.log(`Stremio requested streams for ${cleanId}. Waiting for phone...`);
            currentPendingId = cleanId;
            
            // Save the resolve function so the /push route can trigger it
            pendingRequests[cleanId] = (videoUrl) => {
                console.log(`Link received! Sending stream to Stremio UI.`);
                resolve({
                    streams: [{
                        title: "Stealth Stream\n1080p",
                        url: videoUrl
                    }]
                });
            };

            // IMPORTANT: Stremio's UI times out add-on requests after ~30 seconds.
            // We timeout at 25 seconds to gracefully show "No streams found" instead of an error.
            setTimeout(() => {
                if (pendingRequests[cleanId]) {
                    console.log("Timeout waiting for phone.");
                    delete pendingRequests[cleanId];
                    if (currentPendingId === cleanId) currentPendingId = null;
                    resolve({ streams: [] }); 
                }
            }, 25000);
        });
    }
    return Promise.resolve({ streams: [] });
});

app.use("/", getRouter(builder.getInterface()));

app.get("/pending", (req, res) => {
    res.json({ id: currentPendingId });
});

app.get("/push", (req, res) => {
    const id = req.query.id;
    const videoUrl = req.query.url;
    
    if (pendingRequests[id]) {
        pendingRequests[id](videoUrl); 
        delete pendingRequests[id];
        currentPendingId = null;
        res.send("Success");
    } else {
        res.send("Error: Timeout or invalid ID");
    }
});

const port = process.env.PORT || 7000;
app.listen(port, () => console.log(`Server running on port ${port}`));
