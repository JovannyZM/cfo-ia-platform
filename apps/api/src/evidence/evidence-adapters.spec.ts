import { describe, expect, it } from 'vitest';
import { FakeExpenseEvidenceInterpreter } from './fake-expense-evidence-interpreter';
import { OpenAIExpenseEvidenceInterpreter } from './openai-expense-evidence-interpreter';

describe('expense evidence interpreters', () => {
  it('uses the fake without external calls and receives the in-memory image', async () => {
    const fake = new FakeExpenseEvidenceInterpreter();
    const image = Uint8Array.from([0xff, 0xd8, 0xff]);
    let observed: Uint8Array | undefined;
    fake.onInterpret = (input) => {
      observed = input.image;
    };

    const result = await fake.interpret({ image, mimeType: 'image/jpeg' });

    expect(observed).toBe(image);
    expect(result.merchantName).toBe('Costco');
  });

  it('fails clearly before an external call when OPENAI_API_KEY is missing', async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await expect(
        new OpenAIExpenseEvidenceInterpreter().interpret({
          image: Uint8Array.from([0xff, 0xd8, 0xff]),
          mimeType: 'image/jpeg',
        }),
      ).rejects.toThrow('OPENAI_API_KEY is required');
    } finally {
      if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
    }
  });
});
