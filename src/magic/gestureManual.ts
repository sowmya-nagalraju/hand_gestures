export interface ManualItem { icon: string; name: string; how: string; effect: string }
export interface ManualSection { title: string; items: ManualItem[] }

export const GESTURE_MANUAL: ManualSection[] = [
  {
    title: "One hand · hold a pose",
    items: [
      { icon: "✋", name: "Relaxed hand", how: "Show your hand loosely", effect: "Particles gently follow your palm" },
      { icon: "☝️", name: "Point", how: "Only the index finger up", effect: "Shape follows your fingertip" },
      { icon: "🤏", name: "Pinch", how: "Touch thumb and index tips", effect: "Gravity pull towards your fingers" },
      { icon: "🖐️", name: "Open palm", how: "All five fingers spread", effect: "Particles scatter outward" },
      { icon: "✊", name: "Fist", how: "Close all fingers", effect: "Compress into energy sphere and charge the meter" },
      { icon: "✌️", name: "Two fingers", how: "Index + middle up, tilt hand", effect: "Rotate the shape" },
      { icon: "🤟", name: "Three fingers", how: "Index, middle, ring up", effect: "Jump to the next shape" },
      { icon: "🖖", name: "Four fingers", how: "Four fingers up, thumb tucked in", effect: "Squeeze into a tight ring" },
      { icon: "👍", name: "Thumbs up", how: "Fist with thumb pointing up, hold briefly", effect: "Next colour style" },
      { icon: "👎", name: "Thumbs down", how: "Fist with thumb pointing down, hold briefly", effect: "Previous shape" },
      { icon: "🤘", name: "Rock sign", how: "Index + pinky up", effect: "Vortex spin around" },
      { icon: "🤙", name: "Call sign", how: "Thumb + pinky out", effect: "Swirl the shape sideways" },
      { icon: "🫰", name: "Pinky", how: "Only the little finger up", effect: "Shrink the shape" },
      { icon: "👉", name: "L sign", how: "Thumb + index out like an L", effect: "Aim and gently push particles" },
      { icon: "👌", name: "OK sign", how: "Thumb-index circle, other fingers up, hold", effect: "Freeze / unfreeze time" },
    ],
  },
  {
    title: "Movements",
    items: [
      { icon: "↔️", name: "Swipe", how: "Move open hand fast left or right", effect: "Send a wave" },
      { icon: "🔄", name: "Circle", how: "Draw a circle with the index finger", effect: "Make particles orbit" },
      { icon: "💥", name: "Charged blast", how: "Hold fist, then open your palm", effect: "Burst — stronger the longer you charged" },
    ],
  },
  {
    title: "Two hands",
    items: [
      { icon: "🙌", name: "Stretch", how: "Show both hands, move apart or together", effect: "Grow or shrink the shape" },
      { icon: "👏", name: "Clap", how: "Bring both hands together", effect: "Shockwave burst" },
    ],
  },
  {
    title: "Hand tools (turn on in Magic library)",
    items: [
      { icon: "✍️", name: "Runes", how: "Point and draw circle, triangle, star, line or zigzag", effect: "Orbit, burst, big burst, wave or lightning" },
      { icon: "🎨", name: "Paint / Eraser", how: "Point or pinch to draw, eraser to rub out", effect: "Glowing lines in the air" },
      { icon: "🫧", name: "Bubbles", how: "Touch floating bubbles", effect: "They pop" },
      { icon: "🪄", name: "Staff beam", how: "Pinch", effect: "Fire a beam into the particles" },
    ],
  },
];
