import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  expenseInterpretationResultSchema,
  type ExpenseEvidenceInterpreter,
  type ExpenseEvidenceInterpreterInput,
  type ExpenseInterpretationResult,
} from './expense-evidence-interpreter';

@Injectable()
export class OpenAIExpenseEvidenceInterpreter implements ExpenseEvidenceInterpreter {
  async interpret(
    input: ExpenseEvidenceInterpreterInput,
  ): Promise<ExpenseInterpretationResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for expense interpretation');
    if (!model) throw new Error('OPENAI_MODEL is required for expense interpretation');

    const client = new OpenAI({
      apiKey,
      timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? 30_000),
      maxRetries: 0,
    });
    const dataUrl = `data:${input.mimeType};base64,${Buffer.from(input.image).toString('base64')}`;
    const evidenceInput = input.extractedText
      ? { type: 'input_text' as const, text: `Texto extraído del comprobante:\n${input.extractedText}` }
      : { type: 'input_image' as const, image_url: dataUrl, detail: 'high' as const };
    const response = await client.responses.parse({
      model,
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Para paymentMethod usa CASH, CREDIT_CARD, DEBIT_CARD o TRANSFER cuando sea observable. Si el pago es con tarjeta, devuelve paymentInstrumentType=CARD. Extrae paymentLast4 solo del número de tarjeta enmascarado o de un campo identificado explícitamente como tarjeta; nunca uses autorización, ticket, afiliación, terminal, caja, cajero ni referencia bancaria como paymentLast4. Extrae spenderName solo si el documento identifica explícitamente a quien hizo el gasto. No infieras titulares.',
          },
          {
            type: 'input_text',
            text: 'Analiza esta evidencia de gasto. Extrae únicamente información observable o razonablemente inferible. No inventes datos. Devuelve null cuando un dato no sea visible o confiable. Identifica el total pagado, no subtotal ni cambio. La description debe ser un concepto útil y distinto de merchantName: por ejemplo Compra de supermercado, Gasolina o Consumo en restaurante. En una factura conserva los nombres concretos de los bienes o servicios principales. Devuelve null si solo repetiría el comercio o si no puede inferirse con claridad. No uses conteos como 3 artículos o 5 productos, Compra de artículos ni verbos genéricos. Conserva merchantName por separado. En CFDI busca las etiquetas en todo el texto sin depender del orden visual: EMISOR es merchantName y su RFC es merchantRfc; RECEPTOR nunca es el comercio. Usa FECHA DE EMISIÓN como occurredAt, conservando la hora local impresa cuando no exista zona horaria. Usa TOTAL como originalAmount. Forma documentNumber concatenando SERIE, un espacio y FOLIO; no uses guion ni Número de Pedido. MÉTODO DE PAGO PUE describe la modalidad, no la forma de pago. FORMA DE PAGO 03 significa TRANSFER. Cuando USO DEL CFDI sea I04, usa category Equipo de cómputo. Para tickets, documentNumber prioriza valores etiquetados explícitamente como TICKET, FOLIO, NÚMERO DE TICKET, NO. TICKET o RECIBO; usa TRANSACCIÓN solamente si no existe ticket o folio. Si hay varios candidatos, selecciona el asociado textualmente con TICKET o FOLIO. Nunca uses autorización bancaria, approval code, número de tarjeta, referencia bancaria, número de afiliación, terminal, caja ni cajero. Si no existe un número de documento claro, devuelve documentNumber como null y agrega una advertencia; no inventes ni sustituyas el valor con una autorización bancaria. No devuelvas Markdown ni explicaciones.',
          },
          {
            type: 'input_text',
            text: 'Devuelve también documentIdentifiers con todos los identificadores observables separados y clasificados: TICKET_NUMBER, ORDER_NUMBER, BARCODE, TRANSACTION_NUMBER, AUTHORIZATION_NUMBER, REFERENCE_NUMBER, STORE_NUMBER, REGISTER_NUMBER u OTHER. Un número impreso debajo de un código de barras es BARCODE. STORE_NUMBER solo puede salir de una etiqueta explícita como SUCURSAL o TIENDA; nunca clasifiques como sucursal un número de calle o dirección. REGISTER_NUMBER solo puede salir de CAJA, REGISTER o una etiqueta equivalente. No mezcles documentNumber, paymentLast4, autorización, referencia ni otros identificadores.',
          },
          evidenceInput,
        ],
      }],
      text: {
        format: zodTextFormat(expenseInterpretationResultSchema, 'expense_interpretation'),
      },
      reasoning: { effort: 'low' },
    });
    if (!response.output_parsed) throw new Error('INVALID_INTERPRETER_RESPONSE');
    const parsed = expenseInterpretationResultSchema.parse(response.output_parsed);
    return {
      ...parsed,
      occurredAt: parsed.occurredAt
        ? input.extractedText && !/(?:Z|[+-]\d{2}:\d{2})$/u.test(parsed.occurredAt)
          ? parsed.occurredAt
          : new Date(parsed.occurredAt).toISOString()
        : null,
    };
  }
}
