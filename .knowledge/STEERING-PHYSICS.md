# 🧲 STEERING-PHYSICS.md — Reynolds Steering и пружина Гука

> **Статус (27.08.2026): справочная математика, не код.** Ни одна из формул ниже не
> реализована в `game.js`/`render.js` — это готовые к переносу алгоритмы, привязанные к
> двум конкретным пунктам «Полки идей» в `GAME-MODES.md` («Груз / Фал», «Ньютон»), которые
> сейчас там значатся как каталожные идеи без реализации. Не трогать ядро без отдельной
> явной просьбы — этот файл только хранит формулы до того момента.

---

## 1. Плавное рулевое управление (Reynolds Steering)

Базовый закон: сила руления — это разница между желаемой и текущей скоростью,
ограниченная максимумом.

$$\vec{F}_{\text{steer}} = \text{limit}(\vec{v}_{\text{desired}} - \vec{v}_{\text{current}},\ F_{\text{max}})$$

### `Seek` — плавное преследование цели

```javascript
function seek(agent, target, maxSpeed, maxForce) {
  let dx = target.x - agent.x;
  let dy = target.y - agent.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: 0, y: 0 };

  dx = (dx / dist) * maxSpeed;
  dy = (dy / dist) * maxSpeed;

  let steerX = dx - agent.vx;
  let steerY = dy - agent.vy;
  const steerMag = Math.hypot(steerX, steerY);
  if (steerMag > maxForce) {
    steerX = (steerX / steerMag) * maxForce;
    steerY = (steerY / steerMag) * maxForce;
  }
  return { x: steerX, y: steerY };
}
```

### `Arrive` — подход с торможением (без перелёта и джиттера)

Замедляет агента внутри радиуса `slowRadius`, чтобы он не проскакивал цель и не дрожал
вокруг неё.

```javascript
function arrive(agent, target, maxSpeed, maxForce, slowRadius = 100) {
  let dx = target.x - agent.x;
  let dy = target.y - agent.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: 0, y: 0 };

  dx /= dist;
  dy /= dist;

  const speed = dist < slowRadius ? maxSpeed * (dist / slowRadius) : maxSpeed;
  let steerX = dx * speed - agent.vx;
  let steerY = dy * speed - agent.vy;

  const steerMag = Math.hypot(steerX, steerY);
  if (steerMag > maxForce) {
    steerX = (steerX / steerMag) * maxForce;
    steerY = (steerY / steerMag) * maxForce;
  }
  return { x: steerX, y: steerY };
}
```

**Применение:** любой автономно движущийся агент, которому нужна плавность вместо
телепорта — мин-ловцы, кометы с наведением, ведомые в потенциальном режиме «Стая»
(`GAME-MODES.md`, Слой 2).

---

## 2. Пружина Гука (для режима «Груз / Фал»)

$$\vec{F}_{\text{spring}} = -k \cdot (\lVert\vec{d}\rVert - L_0) \cdot \frac{\vec{d}}{\lVert\vec{d}\rVert}$$

Где `L0` — длина покоя (`restLength`), `k` — жёсткость пружины, `d` — вектор от якоря к грузу.

```javascript
function springForce(anchor, bob, restLength, k) {
  let dx = bob.x - anchor.x;
  let dy = bob.y - anchor.y;
  let dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: 0, y: 0 };

  let stretch = dist - restLength;
  let forceMag = -k * stretch;

  return {
    x: (dx / dist) * forceMag,
    y: (dy / dist) * forceMag
  };
}
```

**Применение:** режим «Груз / Фал» из `GAME-MODES.md` (Слой 2, п.18) — буксировка капсулы
на пружине за самолётиком. `anchor` — самолётик, `bob` — капсула.

---

## 3. Что здесь сознательно не решено

- Числа (`maxSpeed`, `maxForce`, `slowRadius`, `k`, `restLength`) не подобраны под баланс
  игры — это должен быть отдельный «разбор цены» перед кодом, как и для любого нового
  модуля.
- Оба алгоритма не сверялись с живым `game.js` на предмет конфликта с существующим
  детерминизмом «зерно + лента» — если агент, использующий `seek`/`arrive`/пружину,
  должен быть воспроизводим по сиду (как всё остальное в игре), потребуется отдельно
  решить, откуда берётся `vx`/`vy` на каждом кадре без плавающей точки, расходящейся
  между устройствами.
