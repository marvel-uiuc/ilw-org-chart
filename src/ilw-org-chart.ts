import { html, LitElement, unsafeCSS } from "lit";
// @ts-ignore
import styles from "./ilw-org-chart.styles.css?inline";
import "./ilw-org-chart.css";
import { customElement, property } from "lit/decorators.js";
import { Org } from "./Org";
import { calculateLevelOrientations, measureLevelHeights, treeLevelOrgs } from "./tree";

@customElement("ilw-org-chart")
export default class OrgChart extends LitElement {
    @property()
    theme = "";

    @property()
    org: Org | null = null;

    @property()
    width = "1200"

    static get styles() {
        return unsafeCSS(styles);
    }

    constructor() {
        super();
    }

    render() {
        const widths = treeLevelOrgs(this.org!);
        const oriented = calculateLevelOrientations(widths, 150, parseInt(this.width));
        console.log(Object.fromEntries(oriented.entries()));
        const measured = measureLevelHeights(widths, 'org', parseInt(this.width), 150, 300, oriented);
        console.log(measured);
        return html` <div>
            <ul class="org-chart ${this.theme}">
                
            </ul>
        </div> `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ilw-org-chart": OrgChart;
    }
}
