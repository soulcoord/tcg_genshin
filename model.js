// model.js
// 数据模型层：定义游戏初始状态
import { globalBus } from './eventBus.js';
import { CONSTANTS } from './constants.js';

// 模拟卡组生成
function createDeck() {
    const deck = [];
    for (let i = 0; i < CONSTANTS.INITIAL_DECK_SIZE; i++) {
        deck.push({
            id: `card_${i}`,
            name: i % 2 === 0 ? "运筹帷幄" : "蒙德土豆饼", // 示例卡名
            type: i % 2 === 0 ? "Event" : "Event",
            cost: { count: 1, type: 'Common' }
        });
    }
    return deck;
}

// 创建角色工厂函数
const createCharacter = (id, name, element, maxHp = CONSTANTS.DEFAULT_HP, maxEnergy = CONSTANTS.MAX_ENERGY) => ({
    id,
    name,
    hp: maxHp,
    maxHp,
    element,
    energy: 0,
    maxEnergy,
    isAlive: true,
    statuses: [],
    equipment: [],
    elementAttachment: null
});

const initialState = {
    phase: 'PHASE_ROLL',
    roundNumber: 1,
    activePlayerId: 'p1',

    players: {
        p1: {
            id: 'p1',
            isFirst: true,
            hasEndedRound: false,
            activeCharId: 'char_diluc',
            dice: [],
            hand: [],
            deck: createDeck(),

            // 区域定义
            combatStatuses: [], // 出战状态
            summons: [], // 召唤物区 (max 4)
            supports: [], // 支援区 (max 4)

            // 角色列表 (固定3名)
            characters: {
                'char_diluc': createCharacter('char_diluc', '\u8fea\u5362\u514b', 'Pyro', 10, 3),
                'char_kaeya': createCharacter('char_kaeya', '凯亚', 'Cryo', 10, 2),
                'char_sucrose': createCharacter('char_sucrose', '砂糖', 'Anemo', 10, 2)
            }
        },
        p2: {
            id: 'p2',
            isFirst: false,
            hasEndedRound: false,
            activeCharId: 'char_fischl',
            dice: [],
            hand: [],
            deck: createDeck(),

            combatStatuses: [],
            summons: [],
            supports: [],

            characters: {
                'char_fischl': createCharacter('char_fischl', '\u83f2\u8c22\u5c14', 'Electro', 10, 3),
                'char_collei': createCharacter('char_collei', '柯莱', 'Dendro', 10, 2),
                'char_oceanid': createCharacter('char_oceanid', '纯水精灵', 'Hydro', 10, 3) // 模拟Boss/角色
            }
        }
    }
};

export function createReactiveState(state) {
    return new Proxy(state, {
        get(target, prop) {
            if (typeof target[prop] === 'object' && target[prop] !== null) {
                return createReactiveState(target[prop]);
            }
            return target[prop];
        },
        set(target, prop, value) {
            target[prop] = value;
            globalBus.emit('STATE_CHANGED', { prop, value, target }); 
            return true;
        }
    });
}

export const gameState = createReactiveState(initialState);
