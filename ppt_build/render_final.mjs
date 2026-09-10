import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const input = "C:/Users/tcgxu/OneDrive/Desktop/SIH 2026/deliverables/NAVIS_SIH2026_NamasteByte_FINAL.pptx";
const outputDir = "C:/Users/tcgxu/OneDrive/Desktop/SIH 2026/ppt_build/final_render";
await fs.mkdir(outputDir, { recursive: true });
const presentation = await PresentationFile.importPptx(await FileBlob.load(input));

const montage = await presentation.export({ format: "png", montage: true, scale: 1 });
await fs.writeFile(path.join(outputDir, "montage.png"), new Uint8Array(await montage.arrayBuffer()));

for (let index = 0; index < presentation.slides.items.length; index += 1) {
  const slide = presentation.slides.getItem(index);
  const png = await slide.export({ format: "png", scale: 2 });
  await fs.writeFile(path.join(outputDir, `slide-${index + 1}.png`), new Uint8Array(await png.arrayBuffer()));
}

const inspection = await presentation.inspect({
  kind: "deck,slide,textbox,shape,image,notes",
  include: "id,slide,name,title,text,textPreview,textChars,textLines,bbox,bboxUnit,alt",
  maxChars: 300000,
});
await fs.writeFile(path.join(outputDir, "final.inspect.ndjson"), inspection.ndjson, "utf8");
console.log(JSON.stringify({ slideCount: presentation.slides.items.length, outputDir }, null, 2));
