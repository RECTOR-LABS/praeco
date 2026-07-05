import "dotenv/config";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { put } from "@vercel/blob";

async function main() {
  const path = process.argv[2] ?? "video/out/praeco-demo.mp4";
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN not set (Vercel dashboard → Storage → Blob)");
  const body = readFileSync(path);
  const { url } = await put(`demo/${basename(path)}`, body, {
    access: "public",
    contentType: "video/mp4",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  console.log(url);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
