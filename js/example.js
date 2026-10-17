// Beispielplan: 3-Zimmer-Wohnung mit L-förmigem Flur.
import { createEmptyPlan, normalizePlan } from './state.js';

export function examplePlan() {
  const plan = createEmptyPlan('Beispielwohnung');
  plan.rooms = [
    { id: 'wohnen', name: 'Wohnzimmer', color: '#e3edf7', points: [[0, 0], [500, 0], [500, 450], [0, 450]] },
    { id: 'kueche', name: 'Küche', color: '#f6ead9', points: [[500, 0], [900, 0], [900, 250], [500, 250]] },
    { id: 'flur', name: 'Flur', color: '#fbf3d6', points: [[500, 250], [900, 250], [900, 370], [620, 370], [620, 800], [500, 800]] },
    { id: 'bad', name: 'Bad', color: '#dff1f0', points: [[620, 370], [900, 370], [900, 600], [620, 600]] },
    { id: 'arbeit', name: 'Arbeitszimmer', color: '#efe5f5', points: [[620, 600], [900, 600], [900, 800], [620, 800]] },
    { id: 'schlafen', name: 'Schlafzimmer', color: '#e5f2e3', points: [[0, 450], [500, 450], [500, 800], [0, 800]] },
  ];
  const o = (id, type, roomId, wall, t, width, extra = {}) => ({ id, type, roomId, wall, t, width, swing: 'left', flip: false, ...extra });
  plan.openings = [
    o('o1', 'window', 'wohnen', 0, 0.3, 150),
    o('o2', 'window', 'wohnen', 0, 0.78, 120),
    o('o3', 'window', 'wohnen', 3, 0.5, 150),
    o('o4', 'door', 'wohnen', 1, 0.78, 90, { swing: 'right' }),
    o('o5', 'window', 'kueche', 0, 0.5, 120),
    o('o6', 'door', 'kueche', 2, 0.85, 80),
    o('o7', 'door', 'schlafen', 1, 0.2, 80),
    o('o8', 'window', 'schlafen', 2, 0.5, 150),
    o('o9', 'door', 'bad', 3, 0.26, 80),
    o('o10', 'window', 'bad', 1, 0.5, 80),
    o('o11', 'door', 'arbeit', 3, 0.5, 80),
    o('o12', 'window', 'arbeit', 2, 0.5, 100),
    o('o13', 'door', 'flur', 4, 0.5, 90, { flip: true }),
  ];
  let i = 0;
  const f = (type, name, x, y, w, h, rotation, color) => ({ id: `f${++i}`, type, name, x, y, w, h, rotation, color });
  plan.furniture = [
    // Wohnzimmer
    f('rug', 'Teppich', 210, 310, 200, 140, 0, '#e6d8c3'),
    f('sofa', 'Sofa', 210, 400, 220, 90, 180, '#b0bec5'),
    f('coffee-table', 'Couchtisch', 210, 300, 110, 60, 0, '#d7ccc8'),
    f('tv-board', 'TV-Board', 210, 27.5, 180, 45, 0, '#cfd8dc'),
    f('armchair', 'Sessel', 445, 300, 80, 80, 90, '#b0bec5'),
    f('shelf', 'Regal', 22.5, 240, 100, 35, 270, '#d7ccc8'),
    f('plant', 'Pflanze', 455, 45, 45, 45, 0, '#81c784'),
    // Küche
    f('fridge', 'Kühlschrank', 535, 37.5, 60, 65, 0, '#e0e0e0'),
    f('counter', 'Unterschrank', 595, 35, 60, 60, 0, '#e0e0e0'),
    f('stove', 'Herd', 655, 35, 60, 60, 0, '#e0e0e0'),
    f('counter', 'Unterschrank', 715, 35, 60, 60, 0, '#e0e0e0'),
    f('sink', 'Spüle', 785, 35, 80, 60, 0, '#e0e0e0'),
    f('dishwasher', 'Geschirrspüler', 855, 35, 60, 60, 0, '#e0e0e0'),
    f('dining-table', 'Esstisch', 700, 160, 100, 70, 0, '#d7ccc8'),
    f('chair', 'Stuhl', 625, 160, 45, 50, 270, '#bcaaa4'),
    f('chair', 'Stuhl', 775, 160, 45, 50, 90, '#bcaaa4'),
    f('chair', 'Stuhl', 675, 215, 45, 50, 180, '#bcaaa4'),
    f('chair', 'Stuhl', 725, 215, 45, 50, 180, '#bcaaa4'),
    // Schlafzimmer
    f('bed-double', 'Doppelbett', 250, 555, 160, 200, 0, '#c5cae9'),
    f('nightstand', 'Nachttisch', 147.5, 475, 45, 40, 0, '#d7ccc8'),
    f('nightstand', 'Nachttisch', 352.5, 475, 45, 40, 0, '#d7ccc8'),
    f('wardrobe', 'Kleiderschrank', 35, 640, 200, 60, 270, '#d7ccc8'),
    // Bad
    f('bathtub', 'Badewanne', 710, 412.5, 170, 75, 0, '#e1f5fe'),
    f('wc', 'WC', 862.5, 520, 40, 65, 90, '#e1f5fe'),
    f('washbasin', 'Waschbecken', 760, 572.5, 60, 45, 180, '#e1f5fe'),
    f('washer', 'Waschmaschine', 855, 565, 60, 60, 180, '#eceff1'),
    // Arbeitszimmer
    f('desk', 'Schreibtisch', 760, 760, 140, 70, 180, '#ffe0b2'),
    f('office-chair', 'Bürostuhl', 760, 695, 60, 60, 0, '#90a4ae'),
    f('bookshelf', 'Bücherregal', 880, 660, 80, 30, 90, '#d7ccc8'),
    // Flur
    f('dresser', 'Schuhschrank', 522.5, 650, 100, 35, 270, '#d7ccc8'),
  ];
  return normalizePlan(plan);
}
