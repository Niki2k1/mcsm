import type { H3Event } from "h3";
import { z } from "zod";

// Replaces h3-zod: its typings target zod 3, so with zod 4 every validated
// input came back as `any` and the typecheck could not see handler bugs.

type SchemaInput = z.ZodType | z.ZodRawShape;
type Parsed<T extends SchemaInput> = T extends z.ZodType
  ? z.output<T>
  : T extends z.ZodRawShape
    ? z.output<z.ZodObject<T>>
    : never;

async function parseOrBadRequest<T extends SchemaInput>(
  input: unknown,
  schema: T
): Promise<Parsed<T>> {
  const finalSchema = schema instanceof z.ZodType ? schema : z.object(schema);
  try {
    return (await finalSchema.parseAsync(input)) as Parsed<T>;
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      data: error,
    });
  }
}

export const useValidatedQuery = <T extends SchemaInput>(
  event: H3Event,
  schema: T
) => parseOrBadRequest(getQuery(event), schema);

export const useValidatedParams = <T extends SchemaInput>(
  event: H3Event,
  schema: T
) => parseOrBadRequest(getRouterParams(event), schema);

export const useValidatedBody = async <T extends SchemaInput>(
  event: H3Event,
  schema: T
) => parseOrBadRequest(await readBody(event), schema);
