import { AREAS } from "@ahead/ai";
import { localDate } from "@/server/dates";
import type { ReviewRow } from "@/server/review/review-queries";
import type { RowNode } from "@/server/task-tree";

export function ReviewTree({ nodes, timeZone }: { nodes: RowNode<ReviewRow>[]; timeZone: string }) {
  return (
    <ul className="tree">
      {nodes.map((node) => (
        <li key={node.row.id}>
          <ReviewItem row={node.row} timeZone={timeZone} />
          {node.children.length > 0 && <ReviewTree nodes={node.children} timeZone={timeZone} />}
        </li>
      ))}
    </ul>
  );
}

function ReviewItem({ row, timeZone }: { row: ReviewRow; timeZone: string }) {
  const id = row.id;
  const done = row.status === "done";
  return (
    <div className="review-row">
      <input type="hidden" name="id" value={id} />
      <label className="keep">
        <input type="checkbox" name={`keep:${id}`} defaultChecked aria-label="Keep this task" />
        Keep
      </label>
      <input
        className="field field-wide"
        name={`title:${id}`}
        defaultValue={row.title}
        aria-label="Title"
        maxLength={200}
        required
      />
      <div className="review-meta">
        <select className="field field-small" name={`area:${id}`} defaultValue={row.area ?? "work"}>
          {AREAS.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
        <label>
          Due{" "}
          <input
            className="field field-small"
            type="date"
            name={`due:${id}`}
            defaultValue={row.dueAt ? localDate(row.dueAt, timeZone) : ""}
          />
        </label>
        {row.dueAt && row.dueDateConfidence === "guessed" && <span className="badge">guessed</span>}
        <label>
          Effort (min){" "}
          <input
            className="field field-small"
            type="number"
            min={1}
            max={10080}
            name={`effort:${id}`}
            defaultValue={row.effortMin ?? ""}
          />
        </label>
        {row.waitingOn && <span className="muted">Waiting on {row.waitingOn}</span>}
        {done && <span className="badge badge-done">done</span>}
      </div>
    </div>
  );
}
