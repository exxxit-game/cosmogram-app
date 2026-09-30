# 📐 The Nature of Code: Векторы, Силы и Автономные агенты (Daniel Shiffman)

> **Источник:** Daniel Shiffman «The Nature of Code»  
> **Статус:** 🔴 Математическая основа для `game.js`, `gyro.js`, режимов «Фал», «Ньютон», «Багор»

---

## 1. Векторное движение (Position, Velocity, Acceleration)

$$\vec{v}_{t+1} = \text{limit}(\vec{v}_t + \vec{a} \cdot dt, v_{\text{max}})$$
$$\vec{p}_{t+1} = \vec{p}_t + \vec{v}_{t+1} \cdot dt$$

### Ограничение скорости (Vector limit):
```javascript
function limitVec(vx, vy, maxSpeed) {
  const mSq = vx * vx + vy * vy;
  if (mSq > maxSpeed * maxSpeed && mSq > 0) {
    const m = Math.sqrt(mSq);
    return { vx: (vx / m) * maxSpeed, vy: (vy / m) * maxSpeed };
  }
  return { vx, vy };
}
```

---

## 2. Steering Behaviors (Плавное наведение мин и спутников)

### Формула Рейнольдса:
$$\vec{F}_{\text{steer}} = \text{limit}(\vec{v}_{\text{desired}} - \vec{v}_{\text{current}}, F_{\text{max}})$$

В `game.js` плавное следование за пальцем и наведение ловцов реализуется через экспоненциальное сглаживание:
```javascript
// Наведение ловца на самолётик
const dx = plane.x - obstacle.x;
const dy = plane.y - obstacle.y;
const dist = Math.hypot(dx, dy);
if (dist > 0) {
  const desiredVx = (dx / dist) * MAX_SPEED;
  const desiredVy = (dy / dist) * MAX_SPEED;
  obstacle.vx = lerp(obstacle.vx, desiredVx, STEER_FORCE * dt * 60);
  obstacle.vy = lerp(obstacle.vy, desiredVy, STEER_FORCE * dt * 60);
}
```

---

## 3. Закон Гука и Пружины (Режимы «Багор» и «Фал»)

$$\vec{F}_{\text{spring}} = -k \cdot (d - L_0) \cdot \hat{d}$$

Сила сопротивления демпфирует колебания:
$$\vec{F}_{\text{damping}} = -c \cdot \vec{v}$$

# 📐 Cosmogram — Steering Behaviors & Physics Specification

> **Scope:** Autonomous Agent Physics (Reynolds Steering), Hooke's Law Springs, and Smooth Vector Motion for Enemies & Items.

---

## 1. Базовые формулы рулевого управления (Reynolds Steering)

Каждое плавное движение мин-ловцов, комет и самолётика может подчиняться закону:
$$\vec{F}_{\text{steer}} = \vec{v}_{\text{desired}} - \vec{v}_{\text{current}}$$
$$\vec{F}_{\text{steer}} = \text{limit}(\vec{F}_{\text{steer}}, F_{\text{max}})$$

### А. Алгоритм `Seek` (Плавное преследование):
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

### Б. Алгоритм `Arrive` (Плавный подход с торможением):
Предотвращает перелёт и джиттер вокруг цели внутри радиуса `slowRadius`:
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

---

## 2. Физика пружины (Закон Гука для режима «Багор» / «Фал»)

$$\vec{F}_{\text{spring}} = -k \cdot (||\vec{d}|| - L_0) \cdot \frac{\vec{d}}{||\vec{d}||}$$

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
