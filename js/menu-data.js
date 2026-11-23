/* =====================================================================
   Interactive menu — data
   ---------------------------------------------------------------------
   This is the ONLY file a restaurant needs to edit to swap in its own
   dishes, prices, copy and opening hours.

   Each dish:
     id          unique slug, used in the URL-free scroll targets & cart
     category    label shown in the category bar
     name        dish name (serif headline)
     description one line under the name
     weight      optional, e.g. "350 g"
     price       number, in restaurant.currency
     options     optional single-choice pills, e.g. doneness
     scroll      how long the build lasts, in screen-heights of scrolling
     renderer    built-in animated build: "burger" | "pizza" | "steak"
     exit        how the dish leaves when the next one arrives:
                 "lift" | "left" | "fade"
     photos      OPTIONAL. Real photos, one per layer, taken from the same
                 camera: a base photo plus each new ingredient cut out (with
                 transparency) and dropped in. See the burger for the format.
                 A step with mode: "spread" grows out from its centre instead
                 of dropping (sauces). "finale" cross-fades to a last photo.
     cover       photo of the finished dish, used in the hero menu cards
     frames      OPTIONAL. Use your own photoreal build instead of the
                 built-in renderer: an image sequence (e.g. exported from
                 an AI-generated or studio clip, one dish building itself,
                 same camera, dark background).
                   { src: "frames/burger/{i}.webp", count: 120, pad: 4,
                     start: 1, width: 760, y: -140 }
                 {i} is replaced by the frame number (zero-padded to pad).
                 width / y position the image in dish units (plate ≈ 600 wide).
                 The current and next dish's frames are preloaded; the rest
                 load lazily as the visitor gets close.
   ===================================================================== */

window.EMBER_MENU = {
  restaurant: {
    name: "LOGO",
    hero: {
      eyebrow: "Your restaurant · Your city",
      title: "The menu is the show.",
      text: "Scroll, and watch every dish build itself in front of you, layer by layer.",
      cta: "Explore the menu"
    },
    currency: "$",
    tagline: "Fresh. Built in front of you."
  },

  dishes: [
    {
      id: "burgers",
      category: "Burgers",
      name: "The Signature Burger",
      description: "Double smashed beef. Aged cheddar. House sauce.",
      price: 18,
      scroll: 3.4,
      cover: "img/burger/final.webp",
      renderer: "burger",
      exit: "lift",
      frames: null,
      // Real photos, one per layer (same camera). Each "piece" is only the new
      // ingredient cut out of the next photo; it drops onto the previous layer.
      photos: {
        w: 1024, h: 572,          // pixel size of the photos
        width: 860,               // drawn width in dish units (plate ≈ 600)
        plateY: 432,              // y pixel of the plate centre in the photo
        base: "img/burger/base.webp",
        steps: [
          { src: "img/burger/p2.webp", x: 335, y: 209, at: [0.02, 0.14] }, // patties
          { src: "img/burger/p3.webp", x: 337, y: 203, at: [0.15, 0.26] }, // cheddar
          { src: "img/burger/p4.webp", x: 379, y: 175, at: [0.28, 0.38] }, // pickles
          { src: "img/burger/p5.webp", x: 339, y: 100, at: [0.40, 0.51] }, // lettuce
          { src: "img/burger/p6.webp", x: 338, y: 72,  at: [0.52, 0.63] }  // top bun
        ],
        finale: { src: "img/burger/final.webp", at: [0.60, 0.70] }       // flames
      }
    },
    {
      id: "pizza",
      category: "Pizza",
      name: "The Margherita",
      description: "San Marzano tomato, fior di latte and basil, baked until golden and bubbling.",
      price: 22,
      scroll: 3.4,
      cover: "img/pizza/final.webp",
      renderer: "pizza",
      exit: "left",
      frames: null,
      photos: {
        w: 1024, h: 572, width: 900, plateY: 378,
        base: "img/pizza/base.webp",
        steps: [
          { src: "img/pizza/p2.webp", x: 250, y: 234, at: [0.04, 0.18] },                 // dough
          { src: "img/pizza/p3.webp", x: 275, y: 246, at: [0.20, 0.34], mode: "spread" }, // sauce
          { src: "img/pizza/p4.webp", x: 308, y: 243, at: [0.36, 0.48] }                  // mozzarella
        ],
        finale: { src: "img/pizza/final.webp", at: [0.52, 0.70] }                        // baked
      }
    },
    {
      id: "steaks",
      category: "Steaks",
      name: "The Signature Ribeye",
      description: "Seared to order. Brown butter. Thyme.",
      weight: "350 g",
      price: 42,
      options: {
        label: "Doneness",
        choices: ["Medium rare", "Medium", "Well done"],
        default: 0
      },
      scroll: 3.2,
      cover: "img/steak/final.webp",
      renderer: "steak",
      exit: "fade",
      frames: null,
      photos: {
        w: 1024, h: 576, width: 900, plateY: 395,
        base: "img/steak/base.webp",
        steps: [
          { src: "img/steak/p2.webp", x: 245, y: 201, at: [0.10, 0.30] }   // ribeye drops in
        ],
        finale: { src: "img/steak/final.webp", at: [0.38, 0.62] }        // flames, butter, thyme
      }
    }
  ],

  kitchen: {
    eyebrow: "Our kitchen",
    title: "Made fresh. Made to order.",
    body: "This is a demo menu you can adapt to any restaurant. Replace this text with your own story: where the ingredients come from, how the dishes are made and what makes your kitchen different. Every dish, price, photo and opening hour on this page is edited in one file.",
    facts: [
      ["Fresh daily", "Ingredients prepared every morning"],
      ["Made to order", "Every dish built when you order"],
      ["Your fact", "Replace with your own"]
    ]
  },

  visit: {
    eyebrow: "Visit",
    title: "Pull up a chair.",
    address: ["Your street", "Your city"],
    hours: [
      ["Tue – Thu", "6 pm – 11 pm"],
      ["Fri – Sat", "6 pm – 1 am"],
      ["Sun", "1 pm – 10 pm"],
      ["Mon", "Closed"]
    ],
    phone: "+000 0 000 000",
    note: "Walk-ins welcome."
  }
};
