import { waitUntil } from "@vercel/functions";
import { handleDiscordRequest } from "../server/discord-interactions.js";

export default {
  fetch(request) {
    return handleDiscordRequest(request, waitUntil);
  },
};
