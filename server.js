const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());

// This object holds the waiting Stremio players
const pendingRequests = {}; 

const manifest = {
    id: "com.personal.remote.stream",
    version: "1.0.0",
    name: "Remote Phone Handoff",
    description: "Bypass ads on your phone, stream automatically on Stremio.",
    resources: ["stream"],
    types: ["movie"],
    idPrefixes: ["tt", "tmdb:"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(({ type, id }) => {
    if (type === "movie") {
        const cleanId = id.split(":")[1] || id; 
        
        // REPLACE THIS LATER with your cloud URL (e.g., https://my-app.koyeb.app)
        // For local testing, use your computer's local Wi-Fi IP address (e.g., 192.168.1.5)
        const SERVER_URL = process.env.SERVER_URL || "https://stremio-proxy-xyz.onrender.com";
        
        return Promise.resolve({
            streams: [{
                title: "Phone Handoff\n(Tap Bookmarklet)",
                url: `${SERVER_URL}/play/${cleanId}` 
            }]
        });
    }
    return Promise.resolve({ streams: [] });
});

app.use("/", getRouter(builder.getInterface()));

// STREMIO HITS THIS: It holds the connection open and waits for your phone
app.get("/play/:id", (req, res) => {
    const id = req.params.id;
    console.log(`Stremio is waiting for video URL for ID: ${id}...`);
    
    pendingRequests[id] = (videoUrl) => {
        console.log(`Success! Redirecting Stremio to real stream.`);
        res.redirect(videoUrl);
    };

    // Timeout after 3 minutes if you don't push the link from your phone
    setTimeout(() => {
        if (pendingRequests[id]) {
            console.log(`Timeout for ID: ${id}`);
            res.status(404).send("Timeout: URL not received from phone.");
            delete pendingRequests[id];
        }
    }, 3 * 60 * 1000);
});

// YOUR PHONE HITS THIS: It receives the URL and triggers the play route above
app.get("/push", (req, res) => {
    const id = req.query.id;
    const videoUrl = req.query.url;
    
    if (pendingRequests[id]) {
        pendingRequests[id](videoUrl); 
        delete pendingRequests[id];
        res.send("Success! Check your Stremio player, it should be playing now.");
    } else {
        res.send("Error: Stremio wasn't waiting for this movie.");
    }
});

const port = process.env.PORT || 7000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
