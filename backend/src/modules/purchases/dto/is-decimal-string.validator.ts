import {
  registerDecorator,
  type ValidationOptions,
} from "class-validator";

export function IsDecimalString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isDecimalString",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && /^\d+\.\d{2}$/.test(value);
        },
      },
    });
  };
}
