// Instagram CAROUSEL publishing via the Graph API.
// Three-step flow: 1) create one child container per slide image
// (is_carousel_item=true), 2) create a parent CAROUSEL container that
// references the children, 3) publish the parent.
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
// Server-only module: it reads IG_ACCESS_TOKEN. Never import from a client component.

import { getIgUserId } from "./env";
import {
  getContainerStatus,
  publishMediaContainer,
  getMediaPermalink,
  graphPost,
  withPublishVerification,
  type PublishResult,
} from "./publish";

export interface CreateCarouselInput {
  imageUrls: string[]; // 2-10 slide image URLs, in display order
  caption: string;
}

// Step 1: create a single carousel child container from one image URL.
async function createCarouselItem(imageUrl: string): Promise<string> {
  const json = await graphPost(`${getIgUserId()}/media`, {
    image_url: imageUrl,
    is_carousel_item: "true",
  });
  if (!json.id) throw new Error("Graph API did not return a carousel item id");
  return json.id as string;
}

// Full carousel flow: children -> parent container -> wait FINISHED -> publish.
export async function publishCarouselPost(input: CreateCarouselInput): Promise<PublishResult> {
  if (input.imageUrls.length < 2 || input.imageUrls.length > 10) {
    throw new Error("Carousel requires between 2 and 10 images");
  }

  const childIds: string[] = [];
  for (const url of input.imageUrls) {
    childIds.push(await createCarouselItem(url));
  }

  const parent = await graphPost(`${getIgUserId()}/media`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption: input.caption,
  });
  const creationId = parent.id as string;
  if (!creationId) throw new Error("Graph API did not return a carousel container id");

  // Wait for the parent container to finish processing before publishing.
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getContainerStatus(creationId);
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Carousel container ${creationId} failed with status: ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Wrap the final publish step with verification: Meta occasionally returns
  // a generic internal error (code -1, subcode 2207085) even when the carousel
  // was actually created. We recover by matching the caption against recent
  // media on the account.
  return withPublishVerification(
    input.caption,
    async () => {
      const mediaId = await publishMediaContainer(creationId);
      const permalink = await getMediaPermalink(mediaId);
      return { creationId, mediaId, permalink };
    },
    { creationIdFallback: creationId },
  );
}
