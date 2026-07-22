import fetch from "node-fetch";

async function run() {
  const videoId = "dQw4w9WgXcQ";
  const botUA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

  console.log("Fetching YouTube watch page using Googlebot UA...");
  try {
    const resPage = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": botUA,
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    const html = await resPage.text();
    console.log("HTML length:", html.length);

    const match = html.match(/ytInitialPlayerResponse\s*=\s*(.*?);<\/script>/);
    if (match) {
      console.log("Found ytInitialPlayerResponse match!");
      const jsonStr = match[1];
      console.log("JSON string length:", jsonStr.length);
      
      const parsed = JSON.parse(jsonStr);
      console.log("Playability status:", parsed?.playabilityStatus?.status);
      console.log("Playability status reason:", parsed?.playabilityStatus?.reason);

      const captions = parsed?.captions?.playerCaptionsTracklistRenderer;
      if (captions) {
        console.log("SUCCESS! Captions exist in playerResponse!");
        console.log("Caption tracklist keys:", Object.keys(captions));
        if (captions.captionTracks && Array.isArray(captions.captionTracks)) {
          console.log(`Caption tracks count: ${captions.captionTracks.length}`);
          console.log("Caption tracks:", JSON.stringify(captions.captionTracks, null, 2));
        } else {
          console.log("No captionTracks array found inside captions.");
        }
      } else {
        console.log("No captions object found in playerResponse. Keys of playerResponse:", Object.keys(parsed));
      }
    } else {
      console.log("Could not find ytInitialPlayerResponse pattern in HTML.");
    }
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

run();
