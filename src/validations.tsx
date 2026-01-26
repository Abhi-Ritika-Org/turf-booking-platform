import * as Yup from 'yup';

export const signupValidationSchema = Yup.object({
  name: Yup.string().trim().required('Full name is required'),
  mobile: Yup.string()
    .trim()
    .required('Mobile number is required')
    // Require international E.164 format (starts with + and 7-15 digits)
    .matches(/^\+[0-9]{7,15}$/, 'Use international format starting with + and country code, e.g. +1234567890'),
  email: Yup.string().trim().lowercase().email('Invalid email').required('Email is required'),
  password: Yup.string().required('Password is required').min(8, 'Password must be at least 8 characters'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password'), null], 'Passwords must match')
    .required('Confirm your password'),
});

export const loginValidationSchema = Yup.object({
  email: Yup.string().trim().lowercase().email('Invalid email').required('Email is required'),
  password: Yup.string().required('Password is required').min(8, 'Password must be at least 8 characters'),
});
