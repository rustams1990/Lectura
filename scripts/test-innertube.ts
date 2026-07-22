import fetch from "node-fetch";

async function run() {
  const videoId = "mXrRQ5fMWHw";
  
  // Try calling the InnerTube API directly
  const url = `https://www.youtube.com/youtubei/v1/player`;
  console.log("Calling InnerTube player API:", url);
  
  const body = {
    videoId: videoId,
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "17.31.35",
        hl: "en",
        timeZone: "UTC",
        utcOffsetMinutes: 0
      }
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36"
      },
      body: JSON.stringify(body)
    });
    console.log("Status:", res.status);
    const data: any = await res.json();
    
    console.log("Playability Status:", JSON.stringify(data?.playabilityStatus || null, null, 2));
    
    const captions = data?.captions || null;
    console.log("Captions Exist?", !!captions);
    if (captions) {
      console.log("captionTracks:", captions?.playerCaptionsTracklistRenderer?.captionTracks);
    }
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

run();
