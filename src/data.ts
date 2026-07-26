/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lesson, LessonType } from "./types";

export const DEFAULT_LESSON_TYPES: LessonType[] = [
  { id: "youtube", name: "YouTube", icon: "youtube" },
  { id: "podcast", name: "Подкаст", icon: "podcast" },
  { id: "book", name: "Книга", icon: "book" },
  { id: "article", name: "Статья", icon: "article" }
];

export function ensureDefaultLessonTypes(types: LessonType[]): LessonType[] {
  if (!Array.isArray(types) || types.length === 0) return DEFAULT_LESSON_TYPES;
  const result = [...types];
  for (const defaultType of DEFAULT_LESSON_TYPES) {
    if (!result.some((t) => t.id === defaultType.id)) {
      result.push(defaultType);
    }
  }
  return result;
}

export const BUILT_IN_LESSONS: Lesson[] = [
  {
    id: "builtin-es",
    title: "🇪🇸 El Zorro y las Uvas (The Fox and the Grapes)",
    text: "Un zorro hambriento caminaba por el bosque. De repente, vio un racimo de uvas hermosas y maduras que colgaban de una alta parra. Las uvas parecían dulces y jugosas, y el zorro quería comerlas. Él saltó con todas sus fuerzas, pero no pudo alcanzarlas porque estaban demasiado altas. Intentó varias veces sin éxito. Cansado y frustrado, el zorro miró las uvas con desprecio y dijo: 'No las quiero, de todos modos están verdes'. Y se alejó resignado, consolándose con una mentira.",
    targetLanguage: "Spanish",
    translationLanguage: "Russian",
    isBuiltIn: true,
    lessonType: "book"
  },
  {
    id: "builtin-fr",
    title: "🇫🇷 Fripouille à Paris (The Adventure of Fripouille)",
    text: "Fripouille est un petit chat noir très curieux qui habite à Paris. Chaque matin, il aime explorer les toits romantiques de la ville. Aujourd'hui, il décide de visiter la célèbre Tour Eiffel. En chemin, il croise un gros pigeon gris qui mange un morceau de croissant délicieux. Le croissant sent le beurre chaud. Fripouille miaule doucement pour demander une miette. Le pigeon, surpris, s'envole en laissant tomber un grand morceau. C'est le plus beau jour de la semaine pour Fripouille !",
    targetLanguage: "French",
    translationLanguage: "Russian",
    isBuiltIn: true,
    lessonType: "book"
  },
  {
    id: "builtin-de",
    title: "🇩🇪 Ein Spaziergang am Morgen (A Morning Walk)",
    text: "Jeden Morgen geht Hans durch den Stadtpark spazieren. Die Frühlingsluft ist kühl und frisch. Er hört die Vögel in den hohen Bäumen singen. Plötzlich sieht er ein kleines, rotes Eichhörnchen, das unter einer alten Eiche nach Nüssen sucht. Das Eichhörnchen bemerkt Hans und klettert blitzschnell den Baumstamm hinauf. Hans lächelt, nimmt einen tiefen Atemzug und setzt seinen Weg fort. Er liebt diese friedliche Natur mitten in der hektischen Stadt sehr.",
    targetLanguage: "German",
    translationLanguage: "Russian",
    isBuiltIn: true,
    lessonType: "book"
  },
  {
    id: "builtin-ja",
    title: "🇯🇵 猫とサクラの木 (The Cat and the Cherry Blossom)",
    text: "ある春の日、白い猫が一本の大きなサクラの木の下で遊んでいました。サクラの花がピンク色の雪のようにひらひらと风に舞い落ちてきます。猫はその花びらを捕まえようとして、何度も飛び跳ねました。通りかかった子供たちが、その可愛い姿を見て笑顔になりました。猫は少し恥ずかしそうに尾を振って、花の絨毯の上で丸くなって眠ってしまいました。とても穏やかなお昼時でした。",
    targetLanguage: "Japanese",
    translationLanguage: "Russian",
    isBuiltIn: true,
    lessonType: "book"
  },
  {
    id: "builtin-uk",
    title: "🇺🇦 Пригода маленького їжачка (The Adventure of the Little Hedgehog)",
    text: "Маленький їжачок на ім'я Колька жив у великому зеленому лісі. Кожного вечора він виходив на прогулянку, щоб знайти солодкі лісові ягоди та гриби. Сьогодні небо було чистим, а на траві блищала срібна роса. Раптом під старою яблунею Колька побачив велике червоне яблуко. Воно пахло медом і осіннім сонцем. Їжачок спробував підштовхнути яблуко носом, але воно було надто важким. Тоді він обережно наколов його на свої гострі голки і щасливий покотився додому, мріючи про смачну вечерю.",
    targetLanguage: "Ukrainian",
    translationLanguage: "Russian",
    isBuiltIn: true,
    lessonType: "book"
  },
  {
    id: "builtin-pt",
    title: "🇵🇹 A Raposa e as Uvas (The Fox and the Grapes)",
    text: "Uma raposa faminta caminhava pela floresta. De repente, ela viu um cacho de uvas bonitas e maduras que pendiam de uma videira alta. As uvas pareciam doces e suculentas, e a raposa queria muito comê-las. Ela saltou com todas as suas forças, mas não conseguiu alcançá-las porque estavam muito altas. Tentou várias vezes sem sucesso. Cansada e frustrada, a raposa olhou para as uvas com desdém e disse: 'Não as quero, de qualquer forma estão verdes'. E afastou-se resignada, consolando-se com uma mentira.",
    targetLanguage: "Portuguese",
    translationLanguage: "Russian",
    isBuiltIn: true,
    lessonType: "book"
  },
  {
    id: "builtin-kk",
    title: "🇰🇿 Алтын Күз (Golden Autumn)",
    text: "Күз келді. Далада күн салқындай бастады. Жапырақтар сарғайып, жерге түсіп жатыр. Күн қысқарып, түн ұзарды. Құстар жылы жаққа ұшып кетті. Егіншілер егін жинап, қамбаға төкті. Балалар мектепке барады, олар жаңа оқу жылына қуанады. Күз мезгілі өте тамаша және берекелі уақыт.",
    targetLanguage: "Kazakh",
    translationLanguage: "Russian",
    isBuiltIn: true,
    lessonType: "book"
  }
];

export const LANGUAGES_SUPPORTED = [
  "Spanish", "French", "German", "Japanese", "English", "Italian", "Russian", "Chinese", "Arabic", "Ukrainian", "Portuguese", "Kazakh"
];
