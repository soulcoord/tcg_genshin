// view.js
import { gameState } from './model.js';
import { globalBus } from './eventBus.js';

// --- 核心配置：在这里定义各个元素的图标路径 ---
// 提示：你可以将 icon 的 URL 替换为你本地的图片路径，例如 './assets/pyro.png'
const ELEMENT_CONFIG = {
    'Cryo':   { color: '#99FFFF', icon: 'https://placehold.co/100/99FFFF/000?text=❄️' }, // 冰
    'Hydro':  { color: '#69C0FF', icon: 'https://placehold.co/100/69C0FF/000?text=💧' }, // 水
    'Pyro':   { color: '#FF7875', icon: 'https://placehold.co/100/FF7875/000?text=🔥' }, // 火
    'Electro':{ color: '#B37FEB', icon: 'https://placehold.co/100/B37FEB/000?text=⚡' }, // 雷
    'Anemo':  { color: '#95DE64', icon: 'https://placehold.co/100/95DE64/000?text=🍃' }, // 风
    'Geo':    { color: '#FFE58F', icon: 'https://placehold.co/100/FFE58F/000?text=🗿' }, // 岩
    'Dendro': { color: '#B7EB8F', icon: 'https://placehold.co/100/B7EB8F/000?text=🌿' }, // 草
    'Omni':   { color: '#FFFFFF', icon: 'https://placehold.co/100/FFFFFF/000?text=⚪' }  // 万能
};

const CARD_DATA_FILES = ['\u7e3d\u89bd (1).csv', '\u7e3d\u89bd (2).csv', '\u7e3d\u89bd (3).csv'];
const cardImageMap = new Map();
const cardPageMap = new Map();
let cardDataLoaded = false;

export function initView() {
    console.log("Initializing View (Genshin Style V3)...");
    
    renderHand();
    renderPlayerActiveChar();
    renderOpponent();
    updateDiceCounters();

    // 加载 CSV 卡牌数据 (page_url / image)，成功后重新渲染卡牌
    loadCardData()
        .then(() => {
            renderHand();
            renderPlayerActiveChar();
            renderOpponent();
        })
        .catch((err) => {
            console.warn("Card CSV load failed, fallback to text-only cards.", err);
        }); // 初始化时更新一次计数

    const btnEnd = document.getElementById('btn-end-turn');
    if (btnEnd) {
        btnEnd.addEventListener('click', () => {
            globalBus.emit('ACTION_END_TURN');
        });
    }

    // 监听状态变化
    globalBus.on('STATE_CHANGED', (payload) => {
        // 血量更新
        if (payload.prop === 'hp') {
            updateHpBar(payload.target, payload.value);
            checkGameOver(payload.target);
        }
        // 骰子更新
        if (payload.prop === 'dice') {
            // 确保只渲染玩家自己的骰子池 (避免对手骰子变化干扰)
            renderDice(gameState.players.p1.dice); 
            // 同时更新两侧的数字计数
            updateDiceCounters();
        }
        // 手牌更新
        if (payload.prop === 'hand') {
            renderHand(); 
        }
        // 回合阶段变化 -> 更新指针方向
        if (payload.prop === 'phase') {
            updateTurnPointer(payload.value);
        }
    });
}

// ✅ 新增：更新双方骰子计数显示的函数


async function loadCardData() {
    if (cardDataLoaded) return;
    const csvTexts = await Promise.all(
        CARD_DATA_FILES.map((file) => fetch(encodeURI(file)).then((res) => res.text()))
    );
    csvTexts.forEach((csvText) => {
        const rows = parseCsv(csvText);
        if (!rows.length) return;

        const header = rows[0].map((h) => (h || '').trim());
        const idxText = header.indexOf('text');
        const idxImage = header.indexOf('image');
        const idxPng = header.indexOf('png_url');
        const idxPage = header.indexOf('page_url');

        rows.forEach((row, index) => {
            if (index === 0) return;
            const name = (row[idxText] || row[0] || '').trim();
            const image = (row[idxPng] || row[idxImage] || '').trim();
            const pageUrl = (row[idxPage] || row[2] || '').trim();
            if (!name) return;
            if (image) cardImageMap.set(name, image);
            if (pageUrl) cardPageMap.set(name, pageUrl);
        });
    });
    cardDataLoaded = true;
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (ch === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (!inQuotes && (ch === ',' || ch === '\n')) {
            row.push(cell);
            cell = '';
            if (ch === '\n') {
                rows.push(row);
                row = [];
            }
            continue;
        }

        if (ch !== '\r') {
            cell += ch;
        }
    }

    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}

function isImageUrl(url) {
    return /\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(url);
}

function resolveCardImageUrl(name) {
    const pageUrl = cardPageMap.get(name);
    const imageUrl = cardImageMap.get(name);
    if (pageUrl && isImageUrl(pageUrl)) return pageUrl;
    return imageUrl || '';
}

function updateDiceCounters() {
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;

    // 更新玩家计数
    const p1CountEl = document.getElementById('player-dice-count');
    if (p1CountEl) {
        const count = Array.isArray(p1.dice) ? p1.dice.length : 0;
        p1CountEl.textContent = count;
    }

    // 更新对手计数 (支持数组或数字模式)
    const p2CountEl = document.getElementById('opp-dice-count');
    // 只有当 p2.dice 有数据时才更新，否则保持 HTML 默认值
    if (p2CountEl && p2.dice !== undefined) {
        let count = 0;
        if (Array.isArray(p2.dice)) {
            count = p2.dice.length;
        } else if (typeof p2.dice === 'number') {
            count = p2.dice;
        }
        p2CountEl.textContent = count;
    }
}

// 更新回合指针方向
function updateTurnPointer(phase) {
    const pointer = document.getElementById('turn-pointer');
    const phaseText = document.getElementById('phase-text');
    
    if (!pointer) return;

    if (phase === 'PHASE_OPPONENT_TURN') {
        pointer.classList.remove('turn-p1');
        pointer.classList.add('turn-p2');
        if (phaseText) phaseText.textContent = "对手回合";
    } 
    else if (phase === 'PHASE_ACTION_IDLE' || phase === 'PHASE_ROLL') {
        pointer.classList.add('turn-p1');
        pointer.classList.remove('turn-p2');
        if (phaseText) phaseText.textContent = "我的回合";
    }
}

function checkGameOver(targetChar) {
    if (targetChar.hp <= 0) {
        setTimeout(() => {
            alert(targetChar.id === 'char_hilichurl' ? "胜利！" : "失败！");
            globalBus.emit('GAME_OVER');
        }, 300);
    }
}

function renderOpponent() {
    const zone = document.getElementById('opponent-zone');
    if (!zone) return;
    zone.innerHTML = ''; 

    const p2 = gameState.players.p2;
    const charData = p2.characters[p2.activeCharId];
    const imageUrl = resolveCardImageUrl(charData.name);

    const card = document.createElement('div');
    card.className = 'card character-card active';
    card.dataset.id = charData.id; 
    card.style.borderColor = '#99ffff';

    card.innerHTML = `
        <div class="card__visual" style="background: #a4b0be;"></div>
        <div class="card__info">
            <div class="card__name">${charData.name}</div>
            <div class="status-badges">
                <div class="badge hp-badge">${charData.hp}</div>
                <div class="badge">❄️</div>
            </div>
        </div>
        <div class="card__hp-bar-container">
            <div class="card__hp-fill" style="width: ${(charData.hp/charData.maxHp)*100}%"></div>
        </div>
    `;
    zone.appendChild(card);

    const visual = card.querySelector('.card__visual');
    if (visual && imageUrl) {
        visual.style.backgroundImage = `url("${imageUrl}")`;
        visual.style.backgroundSize = 'cover';
        visual.style.backgroundPosition = 'center';
    }
}

function updateHpBar(charState, newHp) {
    const cardEl = document.querySelector(`.card[data-id="${charState.id}"]`);
    if (cardEl) {
        const hpFill = cardEl.querySelector('.card__hp-fill');
        if (hpFill) {
            const percent = (newHp / charState.maxHp) * 100;
            hpFill.style.width = `${percent}%`;
        }
        const hpBadge = cardEl.querySelector('.hp-badge');
        if (hpBadge) {
            hpBadge.textContent = newHp;
        }
        cardEl.style.transform = 'translateY(5px)';
        setTimeout(() => {
            cardEl.style.transform = '';
        }, 100);
    }
}

function renderPlayerActiveChar() {
    const p1Char = gameState.players.p1.characters['char_diluc'];
    const el = document.getElementById('active-char');
    if (el) {
        el.dataset.id = p1Char.id;
        el.querySelector('.card__name').textContent = p1Char.name;
        const visual = el.querySelector('.card__visual');
        const imageUrl = resolveCardImageUrl(p1Char.name);
        if (visual && imageUrl) {
            visual.style.backgroundImage = `url("${imageUrl}")`;
            visual.style.backgroundSize = 'cover';
            visual.style.backgroundPosition = 'center';
        }
        updateHpBar(p1Char, p1Char.hp);
    }
}

function renderDice(diceList) {
    const container = document.getElementById('dice-container');
    if (!container) return;
    container.innerHTML = '';
    
    // 如果传入的 diceList 为空或 undefined，给个默认空数组
    const list = diceList || [];

    list.forEach(type => {
        // 1. 获取该元素类型的配置信息
        const config = ELEMENT_CONFIG[type] || { color: '#cccccc', icon: '' };

        // 2. 创建容器
        const wrapper = document.createElement('div');
        wrapper.className = 'dice-wrapper';
        wrapper.dataset.type = type;
        
        // 3. 创建文字层 (位于底部，作为一种备用的背景文字)
        const textLayer = document.createElement('div');
        textLayer.className = 'dice-text-layer';
        // 显示前两个字母，并使用该元素的代表色
        textLayer.textContent = type.substring(0, 2).toUpperCase(); 
        textLayer.style.color = config.color;

        // 4. 创建图片层 (覆盖在上面)
        const img = document.createElement('img');
        img.className = 'dice-bg-layer';
        // 使用配置中的 icon URL
        img.src = config.icon; 
        img.alt = type;
        
        wrapper.appendChild(textLayer);
        wrapper.appendChild(img);
        
        container.appendChild(wrapper);
    });
}

function renderHand() {
    const handContainer = document.getElementById('hand-area');
    if (!handContainer) return;
    handContainer.innerHTML = ''; 
    gameState.players.p1.hand.forEach(cardData => {
        const card = document.createElement('div');
        card.className = 'card';
        const imageUrl = resolveCardImageUrl(cardData.name);
        const pageUrl = cardPageMap.get(cardData.name);
        card.dataset.pageUrl = pageUrl || '';
        card.innerHTML = `
            <div class="hand-card__image" style="background-image: url('${imageUrl}')"></div>
            <div class="hand-card__label">${cardData.name}</div>
        `;
        card.dataset.id = cardData.id;
        card.addEventListener('mousedown', handleDragStart);
        handContainer.appendChild(card);
    });
}

let draggedEl = null;
let ghostEl = null;
let startX, startY;

function handleDragStart(e) {
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    draggedEl = cardEl;
    const rect = draggedEl.getBoundingClientRect();
    ghostEl = draggedEl.cloneNode(true);
    ghostEl.classList.add('drag-ghost');
    ghostEl.style.width = `${rect.width}px`;
    ghostEl.style.left = `${rect.left}px`;
    ghostEl.style.top = `${rect.top}px`;
    document.body.appendChild(ghostEl);
    draggedEl.classList.add('card--dragging');
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    ghostEl.style.left = `${rect.left}px`;
    ghostEl.style.top = `${rect.top}px`;
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
}

function handleDragMove(e) {
    if (!ghostEl) return;
    ghostEl.style.left = `${e.clientX - startX}px`;
    ghostEl.style.top = `${e.clientY - startY}px`;
}

function handleDragEnd(e) {
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    if (draggedEl) draggedEl.classList.remove('card--dragging');
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    if (!elementBelow) return;
    const battlefield = elementBelow.closest('.battle-field');
    if (battlefield) {
        globalBus.emit('ACTION_PLAY_CARD', { cardId: draggedEl.dataset.id });
    }
    draggedEl = null;
}   
