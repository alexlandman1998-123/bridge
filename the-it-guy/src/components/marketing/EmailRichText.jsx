import { useEffect, useRef } from "react";
import {
  sanitizeRichText,
  escapeHtml,
  TOKENS,
} from "../../../../supabase/functions/_shared/emailDocument.js";

export default function EmailRichText({ block, onChange }) {
  const editor = useRef(null);
  const selection = useRef(null);
  useEffect(() => {
    if (editor.current && document.activeElement !== editor.current)
      editor.current.innerHTML =
        block.richText || escapeHtml(block.text || "").replace(/\n/g, "<br>");
  }, [block.id, block.richText, block.text]);
  const remember = () => {
    const range = window.getSelection();
    if (range?.rangeCount && editor.current?.contains(range.anchorNode))
      selection.current = range.getRangeAt(0).cloneRange();
  };
  const save = () =>
    onChange({
      richText: sanitizeRichText(editor.current.innerHTML),
      text: editor.current.textContent || "",
    });
  const insert = (tag, text, url) => {
    editor.current.focus();
    let range = selection.current;
    if (!range || !editor.current.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor.current);
      range.collapse(false);
    }
    const node = tag
      ? document.createElement(tag)
      : document.createTextNode(text);
    if (tag) {
      if (url) node.setAttribute("href", url);
      node.appendChild(range.extractContents());
      if (!node.textContent) node.textContent = text || "Text";
    } else range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    const current = window.getSelection();
    current.removeAllRanges();
    current.addRange(range);
    selection.current = range.cloneRange();
    save();
  };
  return (
    <div className="eb-rich-text">
      <div className="eb-tabs">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert("strong")}
        >
          Bold
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert("em")}
        >
          Italic
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt(
              "Link destination (https://… or mailto:…)",
            );
            if (url && /^(https?:\/\/|mailto:)/i.test(url))
              insert("a", "Link", url);
          }}
        >
          Link
        </button>
      </div>
      <div
        ref={editor}
        role="textbox"
        aria-label="Rich text"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onInput={save}
        onKeyUp={remember}
        onMouseUp={remember}
        onBlur={remember}
        onPaste={(e) => {
          e.preventDefault();
          insert(null, e.clipboardData.getData("text/plain"));
        }}
      />
      <label className="eb-field">
        Personalise
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) insert(null, `{{${e.target.value}}}`);
          }}
        >
          <option value="">Insert a personal detail…</option>
          {TOKENS.map((token) => (
            <option key={token} value={token}>
              {token.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
