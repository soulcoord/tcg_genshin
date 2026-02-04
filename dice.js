export const ELEMENT_TYPES = [
    'Cryo', 'Hydro', 'Pyro', 'Electro', 
    'Anemo', 'Geo', 'Dendro', 'Omni'
];

export function rollDice(count) {
    const result = [];
    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * ELEMENT_TYPES.length);
        result.push(ELEMENT_TYPES[randomIndex]);
    }
    return result;
}