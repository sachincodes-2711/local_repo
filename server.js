const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());

// Holds the connection to Stremio
const pendingRequests = {}; 
// Tells the phone app what ID is currently waiting
let currentPendingId = null; 

const manifest = {
    id: "com.personal.remote.stream",
    version: "2.0.0",
    name: "Native App Handoff",
    description: "Connects to your custom Android app for seamless scraping.",
    resources: ["stream"],
    types: ["movie"],
    idPrefixes: ["tt", "tmdb:"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(({ type, id }) => {
    if (type === "movie") {
        const cleanId = id.split(":")[1] || id; 
        const SERVER_URL = process.env.SERVER_URL || "https://your-cloud-url.onrender.com";
        return Promise.resolve({
            streams: [{
                title: "Open Phone App",
                url: `${SERVER_URL}/play/${cleanId}` 
            }]
        });
    }
    return Promise.resolve({ streams: [] });
});

app.use("/", getRouter(builder.getInterface()));

// 1. STREMIO HITS THIS: Holds the Stremio loading screen
app.get("/play/:id", (req, res) => {
    const id = req.params.id;
    currentPendingId = id; // Tell the phone app this movie is waiting
    console.log(`Stremio waiting for ID: ${id}`);
    
    pendingRequests[id] = (videoUrl) => {
        console.log(`Redirecting Stremio to real stream!`);
        res.redirect(videoUrl);
    };

    setTimeout(() => {
        if (pendingRequests[id]) {
            res.status(404).send("Timeout.");
            delete pendingRequests[id];
            if (currentPendingId === id) currentPendingId = null;
        }
    }, 3 * 60 * 1000);
});

// 2. PHONE APP HITS THIS ON STARTUP: Asks what movie to load
app.get("/pending", (req, res) => {
    res.json({ id: currentPendingId });
});

// 3. PHONE APP HITS THIS AFTER ADS: Sends the intercepted MP4
app.get("/push", (req, res) => {
    const id = req.query.id;
    const videoUrl = req.query.url;
    
    if (pendingRequests[id]) {
        pendingRequests[id](videoUrl); 
        delete pendingRequests[id];
        currentPendingId = null; // Clear the queue
        res.send("Success");
    } else {
        res.send("Error");
    }
});

const port = process.env.PORT || 7000;
app.listen(port, () => console.log(`Server running on port ${port}`));
