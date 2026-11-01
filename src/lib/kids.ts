// Any mention of children in a name. Ingest uses it to read bare numbers as kids' sizes.
// "Baby Blue" is a colour, not an age.
export const CHILDRENS =
	/\b(kids?|kid['’]s|youth|baby(?! (blue|pink|yellow|green))|babies|toddlers?|infants?|child|children(['’]?s)?)\b/i;

// Stricter: the name says the piece itself is for children, because the children's word opens
// the name or sits right before the garment ("Kids Socks", "Youth T-Shirt"). "Socks That Support
// Youth Sports" and "Sweet Dreams, Baby! Baseball Hat" are adult pieces.
const CHILDREN_WORD = String.raw`(kids?|kid['’]s|youth|baby(?! (blue|pink|yellow|green))|toddlers?|infants?|children['’]?s?)`;
const GARMENT_WORD = String.raw`(t-?shirts?|tees?|shirts?|hats?|caps?|beanies?|socks?|onesies?|hoodies?|sweatshirts?|crewnecks?|jackets?|dresses?)`;
const FOR_CHILDREN = new RegExp(String.raw`^${CHILDREN_WORD}\b|\b${CHILDREN_WORD}\s+${GARMENT_WORD}\b`, 'i');

// Size labels as ingest/sizes.ts writes them: "Kids 8", "Youth S", "Toddler M", "2T", "6M",
// "6-12 months", "4Y".
const CHILD_SIZE = /^((kids|youth|toddler) .+|\d{1,2}(\s*-\s*\d{1,2})?\s*(t|m|mo|months|y|yrs|years))$/i;

export function isChildSize(label: string): boolean {
	return CHILD_SIZE.test(label.trim());
}

export function isForChildren(name: string, sizes: { label: string }[]): boolean {
	const sized = sizes.filter((s) => s.label !== 'One size');
	return FOR_CHILDREN.test(name) || (sized.length > 0 && sized.every((s) => isChildSize(s.label)));
}
