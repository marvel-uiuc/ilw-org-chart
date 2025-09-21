import {
    html,
    LitElement,
    PropertyValues,
    TemplateResult,
    unsafeCSS,
} from "lit";
// @ts-ignore
import "./ilw-org-chart.css";
import { customElement, property, query, state } from "lit/decorators.js";
import { Org } from "./Org";
import {
    calculateLevelOrientations,
    calculateLinesBetweenOrgs,
    ConnectedOrg,
    measureOrgBoxes,
    OrgChartConfig,
    OrgPlacement,
    TreeLevel,
    TreeLevelMap,
    treeLevelOrgs,
} from "./tree";
import { Task } from "@lit/task";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";

@customElement("ilw-org-chart")
export default class OrgChart extends LitElement {
    @property()
    theme = "";

    @property()
    org: Org | null = null;

    @property()
    width = "1200";

    @query(".ilw-org-chart-canvas")
    canvas!: HTMLCanvasElement;

    static config: OrgChartConfig = {
        horizontalSpacing: 40,
        availableSpace: 1200,
        largeOrgSizeMultiplier: 1.5,
        verticalChildOffset: 20,
        verticalSpacing: 30,
        verticalSubtreeSpacing: 20,
        maxColWidth: 300,
        minColWidth: 150,
        skipLineExtraSpacing: 80
    };

    _treeTask = new Task(this, {
        task: async ([org]) => {
            if (!org) {
                return null;
            }
            OrgChart.config.availableSpace = parseInt(this.width);
            const tree = treeLevelOrgs(org);
            calculateLevelOrientations(tree, OrgChart.config);
            const measured = measureOrgBoxes(
                tree,
                "ilw-org-chart",
                OrgChart.config,
            );
            const lines = calculateLinesBetweenOrgs(
                tree,
                measured,
                OrgChart.config,
            );
            return {
                tree,
                measured,
                lines,
            };
        },
        args: () => [this.org] as const,
    });

    constructor() {
        super();
    }

    createRenderRoot() {
        return this;
    }

    refreshTask() {
        this._treeTask.run();
    }

    private renderChildren(
        children: ConnectedOrg[],
        placements: Map<number, OrgPlacement>,
    ): TemplateResult {
        return html`<ul class="org-children">
            ${children.map((child) => this.renderOrg(child, placements))}
        </ul>`;
    }

    private renderOrg(
        org: ConnectedOrg,
        placements: Map<number, OrgPlacement>,
    ): TemplateResult {
        let placement = placements.get(org.id)!;
        const classes = {
            "ilw-org-chart": true,
            "ilw-org-chart-large": !!org.large,
        };
        const styles = {
            top: `${placement?.top}px`,
            left: `${placement?.left}px`,
            width: `${placement?.width}px`,
            height: `${placement?.height}px`,
        };
        return html`<li
            class="org-container"
            level=${org.level}
            id="org-${org.id}"
            lineskiplevels=${org.lineSkipsLevels}
        >
            <div class=${classMap(classes)} style=${styleMap(styles)}>
                <div class="org-title">${org.title}</div>
                <div class="org-subtitle">${org.subtitle}</div>
            </div>
            ${
                org.children && org.children.length > 0
                    ? this.renderChildren(org.children, placements)
                    : ""
            }
        </li>`;
    }

    render() {
        if (this._treeTask.value?.tree?.root) {
            let height = 0;
            for (const placement of this._treeTask.value.measured.values()) {
                height = Math.max(height, placement.top + placement.height);
            }
            return html`<div
                class="ilw-org-chart-container"
                style="width: ${this.width}px; height: ${height + 20}px;"
            >
                <canvas
                    class="ilw-org-chart-canvas"
                    width=${this.width}
                    height=${height + 20}
                ></canvas>
                <ul class="ilw-org-chart-top ${this.theme}">
                    ${this._treeTask.value
                        ? this.renderOrg(
                              this._treeTask.value.tree.root,
                              this._treeTask.value.measured,
                          )
                        : ""}
                </ul>
                <div class="level-debug" style="left: ${this.width}px;">
                <h2>Level Debug Info</h2>
                    ${Array.from(this._treeTask.value.tree.entries()).map(
                        ([level, entry]: [number, TreeLevel], index: number) =>
                            html`<div>
                                <h3>Level ${level} (${entry.orgs.length} orgs):</h3>
                                Orientation: ${entry.orientation}<br />
                                Right Skip: ${entry.rightSkipLine}<br />
                                Left Skip: ${entry.leftSkipLine}<br />
                                Empty Spaces: ${entry.emptySpaces.map((space) => Math.floor(space.start) + "-" + Math.floor(space.end)).join(", ")}<br />
                            </div>`,
                    )}
                </div>
            </div>`;
        } else {
            return html`<div>No organization data provided.</div>`;
        }
    }

    protected updated(_changedProperties: PropertyValues): void {
        super.updated(_changedProperties);

        const ctx = this.canvas?.getContext("2d");
        if (ctx) {
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 4;

            if (this._treeTask.value?.lines) {
                for (const line of this._treeTask.value.lines) {
                    ctx.beginPath();
                    let start = line.points[0];
                    ctx.moveTo(start.x, start.y);
                    for (let i = 1; i < line.points.length; i++) {
                        const point = line.points[i];
                        ctx.lineTo(point.x, point.y);
                    }
                    ctx.lineJoin = "round";
                    
                    ctx.stroke();
                }
            }
        }
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ilw-org-chart": OrgChart;
    }
}
