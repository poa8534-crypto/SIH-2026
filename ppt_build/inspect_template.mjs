import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const sourcePath = "C:/Users/tcgxu/Downloads/SIH2026-IDEA-Presentation-Format.pptx";
const outputDir = "C:/Users/tcgxu/OneDrive/Desktop/SIH 2026/ppt_build/template_inspection";

await fs.mkdir(outputDir, { recursive: true });
const presentation = await PresentationFile.importPptx(await FileBlob.load(sourcePath));

const snapshot = await presentation.inspect({
  kind: "deck,slide,textbox,shape,image,table,chart,notes,thread,layout",
  include: "id,slide,name,title,text,textPreview,textChars,textLines,bbox,bboxUnit,rows,cols,chartType,alt,isPlaceholder,placeholders",
  maxChars: 200000,
});
await fs.writeFile(path.join(outputDir, "template.inspect.ndjson"), snapshot.ndjson, "utf8");

const montage = await presentation.export({ format: "png", montage: true, scale: 1 });
await fs.writeFile(path.join(outputDir, "template-montage.png"), new Uint8Array(await montage.arrayBuffer()));

for (let index = 0; index < presentation.slides.items.length; index += 1) {
  const slide = presentation.slides.getItem(index);
  const preview = await slide.export({ format: "png", scale: 2 });
  await fs.writeFile(
    path.join(outputDir, `slide-${String(index + 1).padStart(2, "0")}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(
    path.join(outputDir, `slide-${String(index + 1).padStart(2, "0")}.layout.json`),
    await layout.text(),
    "utf8",
  );
}

const metadata = {
  sourcePath,
  slideCount: presentation.slides.items.length,
  slideSize: presentation.slideSize ?? null,
  masters: presentation.masters.items.map((master) => ({
    id: master.id,
    name: master.name,
    layoutCount: master.layouts?.items?.length ?? null,
  })),
  layouts: presentation.layouts.items.map((layout) => ({
    id: layout.id,
    name: layout.name,
    placeholders: layout.placeholders?.summary?.() ?? null,
  })),
};
await fs.writeFile(path.join(outputDir, "template.metadata.json"), JSON.stringify(metadata, null, 2), "utf8");
console.log(JSON.stringify(metadata, null, 2));
