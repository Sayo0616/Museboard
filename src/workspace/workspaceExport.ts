import type { CanvasNode, EdgeArrowStyle, EdgeHandle, EdgeLineStyle, Workspace } from "./workspaceTypes";
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
  context.fillStyle = "#faf9f7";
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
      return `<g><rect x="${x}" y="${y}" width="${node.position.width}" height="${node.position.height}" rx="8" fill="#fffefd" stroke="#e7e1d8"/><text x="${x + 14}" y="${y + 24}" font-size="13" font-weight="600" fill="#232323">${title}</text><text x="${x + 14}" y="${y + 48}" font-size="11" fill="#817b73">${body}</text></g>`;
    })
    .join("");
  const edges = page.edges
    .map((edge) => {
      const source = page.nodes.find((node) => node.id === edge.sourceNodeId);
      const target = page.nodes.find((node) => node.id === edge.targetNodeId);
      if (!source || !target) return "";
      const sourceHandle = edge.sourceHandle ?? "right";
      const targetHandle = edge.targetHandle ?? "left";
      const start = edgePoint(source, sourceHandle, offsetX, offsetY);
      const end = edgePoint(target, targetHandle, offsetX, offsetY);
      const labelPoint = edgeLabelPoint(start, sourceHandle, end, targetHandle);
      const stroke = escapeXml(edge.strokeColor ?? "#cdbcb0");
      const strokeWidth = edge.strokeWidth ?? 1.5;
      const label = edge.label
        ? `<text x="${labelPoint.x}" y="${labelPoint.y}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#817b73">${escapeXml(edge.label)}</text>`
        : "";
      return `<path d="${makeEdgePath(start, sourceHandle, end, targetHandle)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round"${dashAttr(edge.lineStyle, strokeWidth)}${markerAttr("start", edge.startArrow)}${markerAttr("end", edge.endArrow ?? "arrow")}/>${label}`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="edge-marker-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker><marker id="edge-marker-circle" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="strokeWidth"><circle cx="4" cy="4" r="3" fill="context-stroke"/></marker><marker id="edge-marker-diamond" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M 5 0 L 10 5 L 5 10 L 0 5 z" fill="context-stroke"/></marker></defs><rect width="100%" height="100%" fill="#faf9f7"/>${edges}${nodes}</svg>`;
}

function edgePoint(node: CanvasNode, handle: EdgeHandle, offsetX: number, offsetY: number) {
  switch (handle) {
    case "top":
      return { x: node.position.x + node.position.width / 2 + offsetX, y: node.position.y + offsetY };
    case "right":
      return { x: node.position.x + node.position.width + offsetX, y: node.position.y + node.position.height / 2 + offsetY };
    case "bottom":
      return { x: node.position.x + node.position.width / 2 + offsetX, y: node.position.y + node.position.height + offsetY };
    case "left":
      return { x: node.position.x + offsetX, y: node.position.y + node.position.height / 2 + offsetY };
  }
}

function makeEdgePath(
  start: { x: number; y: number },
  sourceHandle: EdgeHandle,
  end: { x: number; y: number },
  targetHandle: EdgeHandle,
) {
  const { controlStart, controlEnd } = edgeControlPoints(start, sourceHandle, end, targetHandle);
  return `M ${start.x} ${start.y} C ${controlStart.x} ${controlStart.y}, ${controlEnd.x} ${controlEnd.y}, ${end.x} ${end.y}`;
}

function edgeLabelPoint(
  start: { x: number; y: number },
  sourceHandle: EdgeHandle,
  end: { x: number; y: number },
  targetHandle: EdgeHandle,
) {
  const { controlStart, controlEnd } = edgeControlPoints(start, sourceHandle, end, targetHandle);
  return cubicPoint(start, controlStart, controlEnd, end, 0.5);
}

function edgeControlPoints(
  start: { x: number; y: number },
  sourceHandle: EdgeHandle,
  end: { x: number; y: number },
  targetHandle: EdgeHandle,
) {
  const distance = Math.max(44, Math.min(180, Math.hypot(end.x - start.x, end.y - start.y) * 0.34));
  const controlStart = controlPoint(start, sourceHandle, distance);
  const controlEnd = controlPoint(end, targetHandle, distance);
  return { controlStart, controlEnd };
}

function controlPoint(point: { x: number; y: number }, handle: EdgeHandle, distance: number) {
  switch (handle) {
    case "top":
      return { x: point.x, y: point.y - distance };
    case "right":
      return { x: point.x + distance, y: point.y };
    case "bottom":
      return { x: point.x, y: point.y + distance };
    case "left":
      return { x: point.x - distance, y: point.y };
  }
}

function cubicPoint(
  start: { x: number; y: number },
  controlStart: { x: number; y: number },
  controlEnd: { x: number; y: number },
  end: { x: number; y: number },
  t: number,
) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * start.x + 3 * mt ** 2 * t * controlStart.x + 3 * mt * t ** 2 * controlEnd.x + t ** 3 * end.x,
    y: mt ** 3 * start.y + 3 * mt ** 2 * t * controlStart.y + 3 * mt * t ** 2 * controlEnd.y + t ** 3 * end.y,
  };
}

function markerAttr(position: "start" | "end", style: EdgeArrowStyle | undefined) {
  if (!style || style === "none") return "";
  return ` marker-${position}="url(#edge-marker-${style})"`;
}

function dashAttr(style: EdgeLineStyle | undefined, width: number) {
  if (style === "dotted") return ` stroke-dasharray="${Math.max(1, width)} ${Math.max(4, width * 3)}"`;
  if (style === "dashed") return ` stroke-dasharray="${Math.max(5, width * 4)} ${Math.max(4, width * 3)}"`;
  return "";
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
