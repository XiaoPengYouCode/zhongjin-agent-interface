import type { ReactNode } from "react";
import {
  MdCode,
  MdDataObject,
  MdDescription,
  MdFolder,
  MdHtml,
  MdImage,
  MdInsertDriveFile,
  MdJavascript,
  MdNotes,
  MdPalette,
} from "react-icons/md";

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** 按扩展名映射 Material 文件类型图标。 */
export function fileTypeIcon(name: string, isDir: boolean): ReactNode {
  if (isDir) return <MdFolder />;
  const ext = extOf(name);
  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
    case "ts":
    case "tsx":
      return <MdJavascript />;
    case "json":
    case "jsonc":
      return <MdDataObject />;
    case "css":
    case "scss":
    case "sass":
    case "less":
      return <MdPalette />;
    case "html":
    case "htm":
      return <MdHtml />;
    case "md":
    case "markdown":
      return <MdNotes />;
    case "txt":
    case "log":
      return <MdDescription />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
    case "ico":
      return <MdImage />;
    case "py":
    case "go":
    case "rs":
    case "c":
    case "cpp":
    case "h":
    case "java":
    case "sh":
    case "bash":
    case "yaml":
    case "yml":
    case "toml":
    case "sql":
      return <MdCode />;
    default:
      return <MdInsertDriveFile />;
  }
}
