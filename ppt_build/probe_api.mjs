import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const input = "C:/Users/tcgxu/Downloads/SIH2026-IDEA-Presentation-Format.pptx";
const pres = await PresentationFile.importPptx(await FileBlob.load(input));
console.log("DIRECT_POS", pres.slides.getItem(1).shapes.items.map(s => ({name:s.name, id:s.id, left:s.position.left, top:s.position.top, width:s.position.width, height:s.position.height})).slice(0,8));
for (let i = 0; i < pres.slides.items.length; i += 1) {
  console.log(`SLIDE_${i+1}`, pres.slides.getItem(i).shapes.items.map(s => ({name:s.name, id:s.id, text:String(s.text ?? "").slice(0,100)})));
}
for (const query of [
  "slide.shapes.delete|shape.delete|slides.remove|slides.delete|removeAt|deleteAll",
  "slide.shapes.add|slide.shapes.connect|shape.text.style|shape.position",
  "slide.images.add|image crop|picture crop",
  "presentation.slides",
  "slide.delete|delete slide|remove slide|slides.items",
]) {
  const result = pres.help("*", { search: query, include: ["index", "examples", "notes"], maxChars: 16000 });
  process.stdout.write(`\n=== ${query} ===\n${result.ndjson}\n`);
}
