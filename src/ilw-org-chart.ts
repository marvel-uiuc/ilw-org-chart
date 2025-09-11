import { LitElement, html, unsafeCSS } from "lit";
// @ts-ignore
import styles from './ilw-org-chart.styles.css?inline';
import './ilw-org-chart.css';
import { customElement, property } from "lit/decorators.js";

@customElement("ilw-org-chart")
export default class OrgChart extends LitElement {

    @property()
    theme = "";

    static get styles() {
        return unsafeCSS(styles);
    }

    constructor() {
        super();
    }

    render() {
        return html`
            <div>
                <slot></slot>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ilw-org-chart": OrgChart;
    }
}
