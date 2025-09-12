export interface Org {
    title: string;
    large?: boolean;
    subtitle?: string;
    weight?: number;
    children?: Org[];
}