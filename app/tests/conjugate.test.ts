import { describe, expect, it } from 'vitest';
import { FORMS, aeoForms, checkAnswer, inferClass, makeVerb, verbFor, type ConjClass } from '../src/lib/conjugate';

const form = (dict: string, cls: ConjClass, adj: boolean, key: string) =>
  FORMS.find((f) => f.key === key)!.make(makeVerb(dict, cls, adj))[0];

describe('present polite (-아/어요)', () => {
  const cases: [string, ConjClass, boolean, string][] = [
    ['먹다', 'reg', false, '먹어요'], ['가다', 'reg', false, '가요'], ['오다', 'reg', false, '와요'],
    ['나오다', 'reg', false, '나와요'], ['보다', 'reg', false, '봐요'], ['주다', 'reg', false, '줘요'],
    ['배우다', 'reg', false, '배워요'], ['마시다', 'reg', false, '마셔요'], ['되다', 'reg', false, '돼요'],
    ['내다', 'reg', false, '내요'], ['서다', 'reg', false, '서요'], ['켜다', 'reg', false, '켜요'],
    ['쉬다', 'reg', false, '쉬어요'], ['쓰다', 'reg', false, '써요'], ['바쁘다', 'reg', true, '바빠요'],
    ['예쁘다', 'reg', true, '예뻐요'], ['크다', 'reg', true, '커요'], ['하다', 'ha', false, '해요'],
    ['공부하다', 'ha', false, '공부해요'], ['듣다', 'd', false, '들어요'], ['깨닫다', 'd', false, '깨달아요'],
    ['돕다', 'b', false, '도와요'], ['덥다', 'b', true, '더워요'], ['아름답다', 'b', true, '아름다워요'],
    ['짓다', 's', false, '지어요'], ['낫다', 's', false, '나아요'], ['파랗다', 'h', true, '파래요'],
    ['그렇다', 'h', true, '그래요'], ['하얗다', 'h', true, '하얘요'], ['어떻다', 'h', true, '어때요'],
    ['모르다', 'reu', false, '몰라요'], ['부르다', 'reu', false, '불러요'], ['흐르다', 'reu', false, '흘러요'],
    ['서두르다', 'reu', false, '서둘러요'], ['따르다', 'reg', false, '따라요'], ['들르다', 'reg', false, '들러요'],
    ['이르다', 'reo', false, '이르러요'], ['푸다', 'u', false, '퍼요'], ['살다', 'reg', false, '살아요'],
    ['좋다', 'reg', true, '좋아요'], ['있다', 'reg', false, '있어요'], ['기다리다', 'reg', false, '기다려요'],
    ['보이다', 'reg', false, '보여요'], ['싸우다', 'reg', false, '싸워요'], ['아니다', 'reg', true, '아니에요'],
    ['얇다', 'reg', true, '얇아요'], ['희다', 'reg', true, '희어요'],
  ];
  it.each(cases)('%s (%s) -> %s', (d, c, a, exp) => expect(form(d, c, a, 'pres')).toBe(exp));
});

describe('past and formal', () => {
  it.each([
    ['가다', 'reg', false, 'past', '갔어요'], ['하다', 'ha', false, 'past', '했어요'], ['모르다', 'reu', false, 'past', '몰랐어요'],
    ['오다', 'reg', false, 'past', '왔어요'], ['파랗다', 'h', true, 'past', '파랬어요'], ['돕다', 'b', false, 'past', '도왔어요'],
    ['아니다', 'reg', true, 'past', '아니었어요'], ['먹다', 'reg', false, 'formal', '먹습니다'], ['가다', 'reg', false, 'formal', '갑니다'],
    ['살다', 'reg', false, 'formal', '삽니다'], ['파랗다', 'h', true, 'formal', '파랗습니다'], ['듣다', 'd', false, 'formal', '듣습니다'],
  ] as [string, ConjClass, boolean, string, string][])('%s %s %s', (d, c, a, k, exp) => expect(form(d, c, a, k)).toBe(exp));
});

describe('으-type and consonant endings', () => {
  it.each([
    ['먹다', 'reg', false, 'if', '먹으면'], ['살다', 'reg', false, 'if', '살면'], ['살다', 'reg', false, 'because', '사니까'],
    ['살다', 'reg', false, 'honor', '사세요'], ['살다', 'reg', false, 'adn', '사는'], ['살다', 'reg', false, 'adnpast', '산'],
    ['살다', 'reg', false, 'fut', '살 거예요'], ['살다', 'reg', false, 'plain', '산다'], ['듣다', 'd', false, 'because', '들으니까'],
    ['듣다', 'd', false, 'adnpast', '들은'], ['듣다', 'd', false, 'and', '듣고'], ['돕다', 'b', false, 'if', '도우면'],
    ['덥다', 'b', true, 'adn', '더운'], ['짓다', 's', false, 'adnpast', '지은'], ['짓다', 's', false, 'fut', '지을 거예요'],
    ['파랗다', 'h', true, 'adn', '파란'], ['파랗다', 'h', true, 'if', '파라면'], ['그렇다', 'h', true, 'because', '그러니까'],
    ['작다', 'reg', true, 'adn', '작은'], ['크다', 'reg', true, 'bg', '큰데'], ['먹다', 'reg', false, 'bg', '먹는데'],
    ['재미있다', 'reg', true, 'adn', '재미있는'], ['없다', 'reg', true, 'bg', '없는데'], ['가다', 'reg', false, 'plain', '간다'],
    ['먹다', 'reg', false, 'plain', '먹는다'], ['먹다', 'reg', false, 'honor', '드세요'], ['읽다', 'reg', false, 'honor', '읽으세요'],
    ['먹다', 'reg', false, 'can', '먹을 수 있어요'], ['놀다', 'reg', false, 'can', '놀 수 있어요'], ['크다', 'reg', true, 'become', '커져요'],
    ['공부하다', 'ha', false, 'so', '공부해서'], ['만들다', 'reg', false, 'adnpast', '만든'], ['알다', 'reg', false, 'adn', '아는'],
  ] as [string, ConjClass, boolean, string, string][])('%s %s', (d, c, a, k, exp) => expect(form(d, c, a, k)).toBe(exp));
});

describe('class inference from dictionary samples', () => {
  it.each([
    ['듣다', false, [['듣는'], ['들어'], ['들으니'], ['듣습니다']], 'd'],
    ['묻다', false, [['묻어'], ['묻으니'], ['묻는']], 'reg'],
    ['묻다', false, [['물어'], ['물으니'], ['묻고']], 'd'],
    ['돕다', false, [['도와'], ['도우니'], ['돕는']], 'b'],
    ['입다', false, [['입어'], ['입으니'], ['입는']], 'reg'],
    ['짓다', false, [['지어'], ['지으니'], ['짓는']], 's'],
    ['파랗다', true, [['파란'], ['파래'], ['파라니'], ['파랗습니다']], 'h'],
    ['좋다', true, [['좋은'], ['좋아'], ['좋으니'], ['좋습니다']], 'reg'],
    ['모르다', false, [['몰라'], ['모르니']], 'reu'],
    ['이르다', false, [['이르러'], ['이르니']], 'reo'],
    ['따르다', false, [['따라'], ['따르니']], 'reg'],
    ['푸다', false, [['퍼'], ['푸니']], 'u'],
    ['주다', false, [['주는'], ['주어', '줘'], ['주니'], ['줍니다']], 'reg'],
  ] as [string, boolean, string[][], ConjClass][])('%s -> %s', (d, adj, samples, exp) => expect(inferClass(d, adj, samples)).toBe(exp));

  it('falls back to known irregulars without samples', () => {
    expect(verbFor('걷다', ['동사']).cls).toBe('d');
    expect(verbFor('닫다', ['동사']).cls).toBe('reg');
    expect(verbFor('춥다', ['형용사']).cls).toBe('b');
    expect(verbFor('좁다', ['형용사']).cls).toBe('reg');
  });
});

describe('answers', () => {
  it('accepts alternative spellings and trims', () => {
    const v = makeVerb('보다', 'reg', false);
    expect(aeoForms(v)).toEqual(['봐', '보아']);
    const past = FORMS.find((f) => f.key === 'past')!.make(v);
    expect(checkAnswer(' 보았어요 ', past)).toBe(true);
    expect(checkAnswer('봤어요.', past)).toBe(true);
    expect(checkAnswer('봐써요', past)).toBe(false);
  });
});
