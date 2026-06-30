import type { CanvasNode, Workspace } from "./workspaceTypes";
import { getActivePage } from "./workspaceSelectors";

export function downloadWorkspaceJson(workspace: Workspace): void {
  downloadBlob(`${workspace.title || "museboard-workspace"}.json`, new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" }));
}

export async function downloadWorkspacePng(workspace: Workspace): Promise<void> {
  const svg = workspaceToSvg(workspace);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = new Image();
  const { width, height } = getWorkspaceBounds(workspace);

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("PNG 导出渲染失败。"));
    image.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持 Canvas 导出。");
  context.fillStyle = "#fdfcfc";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0);
  URL.revokeObjectURL(url);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => (nextBlob ? resolve(nextBlob) : reject(new Error("PNG 导出失败。"))), "image/png");
  });
  downloadBlob(`${workspace.title || "museboard-workspace"}.png`, blob);
}

export function downloadWorkspacePdf(workspace: Workspace): void {
  const page = getActivePage(workspace);
  const lines = [
    workspace.title,
    `Page: ${page.name}`,
    `Version: ${workspace.version}`,
    `Nodes: ${page.nodes.length}`,
    `Edges: ${page.edges.length}`,
    "",
    ...page.nodes.flatMap((node) => [`${node.name} (${node.type})`, compactNodeText(node), ""]),
  ];
  downloadBlob(`${workspace.title || "museboard-workspace"}.pdf`, new Blob([makeSimplePdf(lines)], { type: "application/pdf" }));
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function workspaceToSvg(workspace: Workspace): string {
  const page = getActivePage(workspace);
  const { minX, minY, width, height } = getWorkspaceBounds(workspace);
  const offsetX = 32 - minX;
  const offsetY = 32 - minY;
  const nodes = page.nodes
    .map((node) => {
      const x = node.position.x + offsetX;
      const y = node.position.y + offsetY;
      const title = escapeXml(node.name);
      const body = escapeXml(compactNodeText(node));
      return `<g><rect x="${x}" y="${y}" width="${node.position.width}" height="${node.position.height}" rx="8" fill="#fff" stroke="#ece7e7"/><text x="${x + 14}" y="${y + 24}" font-size="13" font-weight="600" fill="#242424">${title}</text><text x="${x + 14}" y="${y + 48}" font-size="11" fill="#8a8585">${body}</text></g>`;
    })
    .join("");
  const edges = page.edges
    .map((edge) => {
      const source = page.nodes.find((node) => node.id === edge.sourceNodeId);
      const target = page.nodes.find((node) => node.id === edge.targetNodeId);
      if (!source || !target) return "";
      const x1 = source.position.x + source.position.width + offsetX;
      const y1 = source.position.y + source.position.height / 2 + offsetY;
      const x2 = target.position.x + offsetX;
      const y2 = target.position.y + target.position.height / 2 + offsetY;
      return `<path d="M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}" fill="none" stroke="#d9c7bf" stroke-width="1.5"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fdfcfc"/>${edges}${nodes}</svg>`;
}

function getWorkspaceBounds(workspace: Workspace) {
  const nodes = getActivePage(workspace).nodes;
  if (nodes.length === 0) return { minX: 0, minY: 0, width: 960, height: 640 };
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(...nodes.map((node) => node.position.x + node.position.width));
  const maxY = Math.max(...nodes.map((node) => node.position.y + node.position.height));
  return { minX, minY, width: Math.max(960, maxX - minX + 64), height: Math.max(640, maxY - minY + 64) };
}

function compactNodeText(node: CanvasNode): string {
  const value = node.props.text ?? node.props.detail ?? node.props.value ?? node.props.title ?? node.type;
  return String(value).replace(/\s+/g, " ").slice(0, 90);
}

function makeSimplePdf(lines: string[]): string {
  const safeLines = lines.slice(0, 42).map((line) => escapePdfText(line));
  const content = ["BT", "/F1 12 Tf", "50 790 Td", "16 TL", ...safeLines.map((line) => `(${line}) Tj T*`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapePdfText(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
