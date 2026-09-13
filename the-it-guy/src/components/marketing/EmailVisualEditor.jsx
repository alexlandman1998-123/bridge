import EmailRichText from "./EmailRichText";
import { useRef, useState } from "react";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  Image,
  LayoutTemplate,
  Link,
  Minus,
  Monitor,
  MousePointerClick,
  PanelBottom,
  PanelTop,
  Plus,
  Smartphone,
  Trash2,
  Type,
} from "lucide-react";
import {
  createEmailDocument,
  newBlock,
  normalizeDocument,
  renderBlock,
  mergeEmail,
  TOKENS,
} from "../../../../supabase/functions/_shared/emailDocument.js";

const BLOCKS = [
  ["header", "Header", PanelTop],
  ["text", "Text", Type],
  ["image", "Image", Image],
  ["button", "Button", MousePointerClick],
  ["property", "Property listing", LayoutTemplate],
  ["divider", "Divider", Minus],
  ["social", "Social links", Link],
  ["footer", "Footer", PanelBottom],
];
export default function EmailVisualEditor({
  document,
  onChange,
  templates,
  listings,
  brand,
  contacts,
  onSaveTemplate,
  onPreviewTemplate,
  context,
  onManageBrand,
}) {
  const [selected, setSelected] = useState(document.blocks[0]?.id);
  const [tab, setTab] = useState("blocks");
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState("");
  const [dropTarget, setDropTarget] = useState("");
  const textInput = useRef(null);
  const block = document.blocks.find((b) => b.id === selected);
  const update = (patch) =>
    onChange({
      ...document,
      blocks: document.blocks.map((b) =>
        b.id === selected ? { ...b, ...patch } : b,
      ),
    });
  const add = (type, target = selected) => {
    if (type === "footer") {
      setSelected(document.blocks.find((b) => b.type === "footer").id);
      return;
    }
    const next = newBlock(type);
    const blocks = [...document.blocks];
    const index = blocks.findIndex((b) => b.id === target);
    blocks.splice(
      index < 0 ? blocks.length - 1 : Math.min(index + 1, blocks.length - 1),
      0,
      next,
    );
    onChange(normalizeDocument({ ...document, blocks }));
    setSelected(next.id);
  };
  const move = (id, offset) => {
    const blocks = [...document.blocks];
    const index = blocks.findIndex((b) => b.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= blocks.length - 1) return;
    const [item] = blocks.splice(index, 1);
    blocks.splice(target, 0, item);
    onChange({ ...document, blocks });
  };
  const drop = (event, target) => {
    event.preventDefault();
    setDropTarget("");
    const type = event.dataTransfer.getData("email/block-type");
    if (type) return add(type, target);
    const id = event.dataTransfer.getData("email/block-id");
    if (id === target) return;
    const item = document.blocks.find((b) => b.id === id);
    if (!item || item.type === "footer") return;
    const blocks = document.blocks.filter((b) => b.id !== id);
    const index = blocks.findIndex((b) => b.id === target);
    blocks.splice(Math.min(index + 1, blocks.length - 1), 0, item);
    onChange({ ...document, blocks });
  };
  const field = (label, key, type = "text") => (
    <label className="eb-field">
      {label}
      <input
        type={type}
        value={block?.[key] || ""}
        onChange={(e) => update({ [key]: e.target.value })}
      />
    </label>
  );
  const values = {
    agency_name: context.agencyName,
    ...contacts.find((c) => c.id === recipient),
  };
  const personalize = (token) => {
    if (!token || !block) return;
    const input = textInput.current;
    const start = input?.selectionStart ?? block.text?.length ?? 0;
    const end = input?.selectionEnd ?? start;
    const insertion = `{{${token}}}`;
    update({
      text:
        (block.text || "").slice(0, start) +
        insertion +
        (block.text || "").slice(end),
    });
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(
        start + insertion.length,
        start + insertion.length,
      );
    });
  };
  return (
    <div className="eb-workspace">
      <aside className="eb-library">
        <h2>Content</h2>
        <div className="eb-tabs">
          {["blocks", "saved"].map((value) => (
            <button
              key={value}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {value === "blocks" ? "Blocks" : "Saved"}
            </button>
          ))}
        </div>
        {tab === "blocks" ? (
          <div className="eb-block-library">
            {BLOCKS.map(([type, label, Icon]) => (
              <button
                key={type}
                draggable={type !== "footer"}
                onDragStart={(e) =>
                  e.dataTransfer.setData("email/block-type", type)
                }
                onClick={() => add(type)}
              >
                <Icon size={19} />
                {label}
                <GripVertical size={16} />
              </button>
            ))}
          </div>
        ) : (
          <div className="eb-template-list">
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Replace this layout with a fresh buyer update? Your saved revisions remain available.",
                  )
                )
                  onChange(createEmailDocument(brand));
              }}
            >
              Buyer update · Starter layout
            </button>
            {templates.map((template) => (
              <article key={template.id}>
                <iframe
                  title={`${template.name} thumbnail`}
                  sandbox=""
                  srcDoc={template.html}
                  tabIndex={-1}
                />
                <strong>{template.name}</strong>
                <small>{template.category}</small>
                <div>
                  <button onClick={() => onPreviewTemplate(template)}>
                    Preview
                  </button>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Replace the current content with this template? Unsaved changes will be replaced.",
                        )
                      ) {
                        if (template.design_json?.version === 1)
                          onChange(normalizeDocument(template.design_json));
                        else
                          onChange({
                            ...document,
                            mode: "advanced",
                            advancedHtml: template.html,
                          });
                      }
                    }}
                  >
                    Apply template
                  </button>
                </div>
              </article>
            ))}
            <button onClick={onSaveTemplate}>
              <Plus size={15} />
              Save current layout
            </button>
          </div>
        )}
        <section className="eb-brand">
          <h3>Brand</h3>
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.name || "Agency logo"} />
          ) : (
            <strong className="eb-brand-name">
              {brand.name || "Your agency"}
            </strong>
          )}
          <p>Email defaults</p>
          <label className="eb-colour">
            Primary colour
            <input
              aria-label="Primary brand colour"
              type="color"
              value={document.globalStyles.primaryColour || "#18765b"}
              onChange={(e) =>
                onChange({
                  ...document,
                  globalStyles: {
                    ...document.globalStyles,
                    primaryColour: e.target.value,
                  },
                })
              }
            />
          </label>
          <div className="eb-swatches">
            <i style={{ background: "#13223b" }} />
            <i style={{ background: document.globalStyles.primaryColour }} />
            <i style={{ background: "#f4efe7" }} />
          </div>
          <button onClick={onManageBrand}>Manage brand</button>
          <small>Individual block colours are preserved.</small>
        </section>
      </aside>
      <section className="eb-canvas-panel">
        <div className="eb-canvas-heading">
          <h2>Email preview</h2>
          <div className="eb-tabs">
            <button aria-pressed={!mobile} onClick={() => setMobile(false)}>
              <Monitor size={16} />
              Desktop
            </button>
            <button aria-pressed={mobile} onClick={() => setMobile(true)}>
              <Smartphone size={16} />
              Mobile
            </button>
          </div>
        </div>
        <label className="eb-preview-recipient">
          Preview as
          <select
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          >
            <option value="">Fallback recipient</option>
            {contacts.map((c) => (
              <option value={c.id} key={c.id}>
                {c.full_name || c.email}
              </option>
            ))}
          </select>
        </label>
        <div className="eb-canvas-scroll">
          <div className={`eb-email-page ${mobile ? "is-mobile" : ""}`}>
            {document.blocks.map((item) => (
              <div
                key={item.id}
                className={`eb-canvas-block ${selected === item.id ? "is-selected" : ""} ${dropTarget === item.id ? "is-drop-target" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(item.id);
                }}
                onDragLeave={() => setDropTarget("")}
                onDrop={(e) => drop(e, item.id)}
              >
                {selected === item.id && item.type !== "footer" && (
                  <div className="eb-block-toolbar">
                    <button
                      aria-label="Drag block"
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("email/block-id", item.id)
                      }
                    >
                      <GripVertical size={15} />
                    </button>
                    <button
                      aria-label="Move block up"
                      onClick={() => move(item.id, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      aria-label="Move block down"
                      onClick={() => move(item.id, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      aria-label="Duplicate block"
                      onClick={() => {
                        const copy = {
                          ...structuredClone(item),
                          id: crypto.randomUUID(),
                        };
                        const blocks = [...document.blocks];
                        blocks.splice(
                          blocks.findIndex((b) => b.id === item.id) + 1,
                          0,
                          copy,
                        );
                        onChange({ ...document, blocks });
                        setSelected(copy.id);
                      }}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      aria-label="Delete block"
                      onClick={() => {
                        onChange({
                          ...document,
                          blocks: document.blocks.filter(
                            (b) => b.id !== item.id,
                          ),
                        });
                        setSelected(
                          document.blocks.find((b) => b.id !== item.id)?.id,
                        );
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
                <button
                  className="eb-select-block"
                  aria-label={`Edit ${BLOCKS.find(([type]) => type === item.type)?.[1]}`}
                  onClick={() => setSelected(item.id)}
                />
                {item.type === "image" && !item.src ? (
                  <div className="eb-image-placeholder">
                    <Image size={34} />
                    <strong>Add your hero image</strong>
                    <span>Choose an image in the editor</span>
                  </div>
                ) : (
                  <div
                    className="eb-rendered-block"
                    dangerouslySetInnerHTML={{
                      __html: mergeEmail(
                        renderBlock(item, document.globalStyles, context),
                        values,
                      ),
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
      <aside className="eb-inspector">
        <h2>Edit content</h2>
        {!block ? (
          <p>Select a block to edit its content.</p>
        ) : (
          <>
            <span className="eb-eyebrow">
              {BLOCKS.find(([type]) => type === block.type)?.[1]}
            </span>
            {["header", "button"].includes(block.type) && (
              <>
                <label className="eb-field">
                  {block.type === "button" ? "Button label" : "Text"}
                  <textarea
                    ref={textInput}
                    rows={block.type === "text" ? 6 : 2}
                    value={block.text || ""}
                    onChange={(e) => update({ text: e.target.value })}
                  />
                </label>
                <label className="eb-field">
                  Personalise
                  <select
                    value=""
                    onChange={(e) => personalize(e.target.value)}
                  >
                    <option value="">Insert a personal detail…</option>
                    {TOKENS.map((token) => (
                      <option key={token} value={token}>
                        {token.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {block.type === "text" && (
              <>
                <EmailRichText block={block} onChange={update} />
                <label className="eb-field">
                  Text style
                  <select
                    value={block.style}
                    onChange={(e) => update({ style: e.target.value })}
                  >
                    <option value="body">Paragraph</option>
                    <option value="heading">Heading</option>
                  </select>
                </label>
                <div className="eb-tabs">
                  <button
                    aria-pressed={Boolean(block.bold)}
                    onClick={() => update({ bold: !block.bold })}
                  >
                    <b>Bold</b>
                  </button>
                  <button
                    aria-pressed={Boolean(block.italic)}
                    onClick={() => update({ italic: !block.italic })}
                  >
                    <i>Italic</i>
                  </button>
                </div>
                {field("Text link", "url", "url")}
              </>
            )}
            {["image", "header"].includes(block.type) && (
              <>
                {block.src && (
                  <img
                    className="eb-image-thumb"
                    src={block.src}
                    alt={block.alt || "Selected image"}
                  />
                )}
                {field("Image URL", "src", "url")}
                <small>
                  Use a permanent public image URL, or choose listing media
                  below.
                </small>
                <label className="eb-field">
                  Media library
                  <select
                    value=""
                    onChange={(e) => update({ src: e.target.value })}
                  >
                    <option value="">Choose a listing image…</option>
                    {listings
                      .filter((l) => l.image)
                      .map((l) => (
                        <option key={l.id} value={l.image}>
                          {l.address}
                        </option>
                      ))}
                  </select>
                </label>
                {block.type === "image" && (
                  <>
                    {field("Alt text", "alt")}
                    {field("Image link", "url", "url")}
                  </>
                )}
                <button onClick={() => update({ src: "" })}>
                  Remove image
                </button>
              </>
            )}
            {block.type === "button" && (
              <>
                {field("Destination URL", "url", "url")}
                <label className="eb-field">
                  Button style
                  <select
                    value={block.variant}
                    onChange={(e) => update({ variant: e.target.value })}
                  >
                    <option value="filled">Filled</option>
                    <option value="outline">Outline</option>
                  </select>
                </label>
                {field("Button colour", "colour", "color")}
              </>
            )}
            {block.type === "property" && (
              <>
                <label className="eb-field">
                  Card layout
                  <select
                    value={block.layout}
                    onChange={(e) =>
                      update({
                        layout: e.target.value,
                        listings:
                          e.target.value === "featured"
                            ? block.listings.slice(0, 1)
                            : block.listings,
                      })
                    }
                  >
                    <option value="featured">Single featured listing</option>
                    <option value="grid">Two-column grid</option>
                    <option value="list">List</option>
                  </select>
                </label>
                {field("CTA label", "text")}
                <label className="eb-field">
                  Search listings
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Address or suburb"
                  />
                </label>
                <div className="eb-listing-picker">
                  {listings
                    .filter((l) =>
                      `${l.address} ${l.suburb}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((l) => (
                      <button
                        key={l.id}
                        disabled={block.listings.some((x) => x.id === l.id)}
                        onClick={() =>
                          update({
                            listings:
                              block.layout === "featured"
                                ? [l]
                                : [...block.listings, l],
                          })
                        }
                      >
                        {l.image && <img src={l.image} alt="" />}
                        <span>
                          {l.address}
                          <small>
                            {l.price} · {l.suburb}
                          </small>
                        </span>
                        <Plus size={14} />
                      </button>
                    ))}
                  {!listings.length && (
                    <p>No available listings in this workspace.</p>
                  )}
                </div>
                {block.listings.map((l, index) => (
                  <div className="eb-selected-listing" key={l.id}>
                    <strong>{l.address}</strong>
                    <label className="eb-field">
                      Public listing URL
                      <input
                        value={l.url}
                        onChange={(e) =>
                          update({
                            listings: block.listings.map((x) =>
                              x.id === l.id ? { ...x, url: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      disabled={!index}
                      onClick={() => {
                        const items = [...block.listings];
                        [items[index - 1], items[index]] = [
                          items[index],
                          items[index - 1],
                        ];
                        update({ listings: items });
                      }}
                    >
                      Move up
                    </button>
                    <button
                      onClick={() =>
                        update({
                          listings: block.listings.filter((x) => x.id !== l.id),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </>
            )}
            {block.type === "social" && (
              <>
                {block.links.map((link, i) => (
                  <div key={i}>
                    <label className="eb-field">
                      Label
                      <input
                        value={link.label}
                        onChange={(e) =>
                          update({
                            links: block.links.map((x, j) =>
                              j === i ? { ...x, label: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="eb-field">
                      URL
                      <input
                        value={link.url}
                        onChange={(e) =>
                          update({
                            links: block.links.map((x, j) =>
                              j === i ? { ...x, url: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      onClick={() =>
                        update({ links: block.links.filter((_, j) => j !== i) })
                      }
                    >
                      Remove link
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    update({
                      links: [...block.links, { label: "Social", url: "" }],
                    })
                  }
                >
                  Add link
                </button>
              </>
            )}
            {block.type === "footer" ? (
              <p>
                Agency details and the recipient’s unsubscribe link are
                protected and added automatically at delivery.
              </p>
            ) : (
              <>
                <details>
                  <summary>Typography</summary>
                  <label className="eb-field">
                    Alignment
                    <select
                      value={block.align}
                      onChange={(e) => update({ align: e.target.value })}
                    >
                      {["left", "center", "right"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  {field("Text colour", "textColour", "color")}
                </details>
                <details>
                  <summary>Spacing</summary>
                  <label className="eb-field">
                    Padding
                    <input
                      type="range"
                      min="0"
                      max="60"
                      value={block.padding}
                      onChange={(e) =>
                        update({ padding: Number(e.target.value) })
                      }
                    />
                  </label>
                </details>
                <details>
                  <summary>Background</summary>
                  {field("Background colour", "background", "color")}
                </details>
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
