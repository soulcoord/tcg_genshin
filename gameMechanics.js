// gameMechanics.js
import { CONSTANTS } from './constants.js';

export class GameMechanics {

    /**
     * 从牌库抽牌
     * @param {Object} player 玩家状态对象
     * @param {Number} count 抽牌数量
     */
    static drawCards(player, count) {
        // 为了触发 View 更新，我们需要创建一个新的 Hand 数组引用
        // 因为 View.js 监听的是 player.hand 的赋值 (prop === 'hand')
        let newHand = [...player.hand];
        let newDeck = [...player.deck];
        let drawnCount = 0;

        for (let i = 0; i < count; i++) {
            if (newDeck.length === 0) {
                console.log(">>> 牌库已空，无法抽牌");
                break;
            }

            // 爆牌检查
            if (newHand.length >= CONSTANTS.MAX_HAND) {
                const burntCard = newDeck.shift();
                console.log(`>>> 手牌已满 (${CONSTANTS.MAX_HAND})，"${burntCard.name}" 被销毁 (爆牌)`);
            } else {
                const card = newDeck.shift();
                newHand.push(card);
                console.log(`>>> 抽到了 "${card.name}"`);
                drawnCount++;
            }
        }

        // 批量更新状态
        if (drawnCount > 0 || newDeck.length !== player.deck.length) {
            player.deck = newDeck;
            player.hand = newHand; // 这将触发 view.js 的 prop === 'hand'
        }
    }

    /**
     * 放置支援牌 (处理格子限制)
     * @param {Object} player
     * @param {Object} card
     */
    static addSupport(player, card) {
        let newSupports = [...player.supports];

        if (newSupports.length >= CONSTANTS.MAX_SUPPORT) {
            const removed = newSupports.shift();
            console.log(`>>> 支援区已满，销毁旧卡 "${removed.name}"`);
        }
        newSupports.push(card);
        console.log(`>>> 放置支援牌 "${card.name}"`);

        player.supports = newSupports; // 触发更新
    }

    /**
     * 生成召唤物 (处理格子限制)
     * @param {Object} player
     * @param {Object} summon { name, duration, effect... }
     */
    static addSummon(player, summon) {
        let newSummons = [...player.summons];

        if (newSummons.length >= CONSTANTS.MAX_SUMMONS) {
            const removed = newSummons.shift();
            console.log(`>>> 召唤区已满，销毁 "${removed.name}"`);
        }
        newSummons.push(summon);
        console.log(`>>> 生成召唤物 "${summon.name}"`);

        player.summons = newSummons; // 触发更新
    }

    static resetRoundResources(player) {
        player.dice = [];
        player.hasEndedRound = false;
    }
}
