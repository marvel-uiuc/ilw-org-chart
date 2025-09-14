import { html, LitElement, TemplateResult, unsafeCSS } from "lit";
// @ts-ignore
import styles from "./ilw-org-chart.styles.css?inline";
import "./ilw-org-chart.css";
import { customElement, property, state } from "lit/decorators.js";
import { Org } from "./Org";
import {
    calculateLevelOrientations,
    ConnectedOrg,
    measureOrgBoxes,
    OrgChartConfig,
    OrgPlacement,
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

    config: OrgChartConfig = {
        horizontalSpacing: 40,
        availableSpace: parseInt(this.width),
        largeOrgSizeMultiplier: 1.5,
        verticalChildOffset: 20,
        verticalSpacing: 20,
        verticalSubtreeSpacing: 10,
        maxColWidth: 300,
        minColWidth: 150
    };

    _treeTask = new Task(this, {
        task: async ([org]) => {
            if (!org) {
                return null;
            }
            const tree = treeLevelOrgs(org);
            calculateLevelOrientations(tree, this.config);
            const measured = measureOrgBoxes(tree, "ilw-org-chart", this.config);
            return {
                tree,
                measured,
            };
        },
        args: () => [this.org] as const,
    });

    static get styles() {
        return unsafeCSS(styles);
    }

    constructor() {
        super();
    }

    createRenderRoot() {
        return this;
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
            top: `${placement.top}px`,
            left: `${placement.left}px`,
            width: `${placement.width}px`,
            height: `${placement.height}px`,
        };
        return html`<li
            class="org-container""
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
                <canvas class="ilw-org-chart-canvas" width=${this.width} height=${height + 20}></canvas>
                <ul class="ilw-org-chart ${this.theme}">
                    ${this._treeTask.value
                        ? this.renderOrg(
                              this._treeTask.value.tree.root,
                              this._treeTask.value.measured,
                          )
                        : ""}
                </ul>
            </div>`;
        } else {
            return html`<div>No organization data provided.</div>`;
        }
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ilw-org-chart": OrgChart;
    }
}
