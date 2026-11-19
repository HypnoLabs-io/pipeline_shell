import "server-only";
import { generateText } from "ai";
import { sampleFrames } from "@/lib/media/ffmpeg";
import { model } from "@/lib/integrations/llm";

// Video understanding for any vision model in the registry (Ollama gemma4/llava, Claude, GPT).
// None of the configured providers take video files natively, so ffmpeg samples evenly spaced
// stills and each one goes to the model as an image, labelled with its timestamp.

export type DescribeVideoOptions = {
  file: string;
  prompt: string;
  /** "<provider>:<model>"; defaults to VISION_MODEL. */
  model?: string;
  /** How many stills to sample across the whole video. */
  frames?: number;
  /** Width of each still in pixels (height keeps the aspect ratio). */
  width?: number;
  system?: string;
};

export async function describeVideo(o: DescribeVideoOptions) {
  const frames = await sampleFrames({ file: o.file, count: o.frames ?? 8, width: o.width ?? 768 });
  const { text } = await generateText({
    model: model({ id: o.model, purpose: "vision" }),
    system: o.system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `These are ${frames.length} stills sampled evenly from one video, in order. ${o.prompt}`,
          },
          ...frames.flatMap((f) => [
            { type: "text" as const, text: `Frame at ${f.time.toFixed(2)}s:` },
            { type: "file" as const, mediaType: f.mediaType, data: f.data },
          ]),
        ],
      },
    ],
  });
  return { text, frameTimes: frames.map((f) => f.time) };
}
