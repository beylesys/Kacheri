// KACHERI FRONTEND/src/components/TableToolbar.tsx

import React from "react";
import type { Editor } from "@tiptap/react";

export interface TableToolbarProps {
  editor: Editor | null;
}

/**
 * TableToolbar
 *
 * Small, context-aware toolbar for TipTap's table extension.
 * - Always shows "Insert table".
 * - When the selection is inside a table, shows row/column and merge/split controls.
 *
 * This is intentionally dumb about styling; .table-toolbar* classes can be
 * styled in ui.css to match the rest of Kacheri.
 */
const TableToolbar: React.FC<TableToolbarProps> = ({ editor }) => {
  if (!editor) return null;

  const inTable =
    editor.isActive("table") ||
    editor.isActive("tableRow") ||
    editor.isActive("tableCell") ||
    editor.isActive("tableHeader");

  const run = (fn: (e: Editor) => void) => {
    if (!editor) return;
    fn(editor);
  };

  return (
    <div className="table-toolbar">
      {/* Always-available: insert a fresh table */}
      <div className="table-toolbar-group">
        <button
          type="button"
          className="table-toolbar-button"
          onClick={() =>
            run((e) =>
              e
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            )
          }
        >
          Insert table
        </button>
      </div>

      {/* Contextual controls only when the cursor is inside a table */}
      {inTable && (
        <>
          <div className="table-toolbar-group">
            <span className="table-toolbar-label">Rows</span>
            <button
              type="button"
              className="table-toolbar-button"
              onClick={() => run((e) => e.chain().focus().addRowBefore().run())}
            >
              + Row above
            </button>
            <button
              type="button"
              className="table-toolbar-button"
              onClick={() => run((e) => e.chain().focus().addRowAfter().run())}
            >
              + Row below
            </button>
            <button
              type="button"
              className="table-toolbar-button"
              onClick={() => run((e) => e.chain().focus().deleteRow().run())}
            >
              Delete row
            </button>
          </div>

          <div className="table-toolbar-group">
            <span className="table-toolbar-label">Columns</span>
            <button
              type="button"
              className="table-toolbar-button"
              onClick={() =>
                run((e) => e.chain().focus().addColumnBefore().run())
              }
            >
              + Col left
            </button>
            <button
              type="button"
              className="table-toolbar-button"
              onClick={() =>
                run((e) => e.chain().focus().addColumnAfter().run())
              }
            >
              + Col right
            </button>
            <button
              type="button"
              className="table-toolbar-button"
              onClick={() =>
                run((e) => e.chain().focus().deleteColumn().run())
              }
            >
              Delete col
            </button>
          </div>

          <div className="table-toolbar-group">
            <span className="table-toolbar-label">Structure</span>
            <button
              type="button"
              className="table-toolbar-button"
              onClick={() =>
                run((e) => e.chain().focus().toggleHeaderRow().run())
              }
            >
              Toggle header row
            </button>
            <button
              type="button"
              className="table-toolbar-button"
              onClick={() => run((e) => e.chain().focus().mergeCells().run())}
            >
              Merge cells
            </button>
            <button
              type="button"
              className="table-toolbar-button"
              onClick={() => run((e) => e.chain().focus().splitCell().run())}
            >
              Split cell
            </button>
            <button
              type="button"
              className="table-toolbar-button table-toolbar-danger"
              onClick={() =>
                run((e) => e.chain().focus().deleteTable().run())
              }
            >
              Delete table
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default TableToolbar;
