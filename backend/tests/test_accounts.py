import unittest

from pydantic import ValidationError
from farm.accounts import Login, Registration
from farm.passwords import hash_password, verify_password


class AccountTests(unittest.TestCase):
    def test_salted_password_round_trip(self):
        password = 'technical fixture пароль'
        first, second = hash_password(password), hash_password(password)
        self.assertNotEqual(first, second)
        self.assertTrue(verify_password(password, first))
        self.assertFalse(verify_password(password.upper(), first))
        self.assertFalse(verify_password(password, 'malformed'))
        self.assertNotIn(password, first)

    def test_normalized_identifiers(self):
        account = Registration(username='Mixed.Name', email='User@Example.com', password='twelve characters')
        self.assertEqual(account.username, 'mixed.name')
        self.assertEqual(account.email, 'user@example.com')
        self.assertEqual(Login(identifier=' User@Example.com ', password='x').identifier, account.email)

    def test_registration_rejects_ambiguous_username_and_bad_email(self):
        for field, value in [('username', 'u@example.com'), ('username', 'ab'),
                             ('username', '-user'), ('email', 'not-an-email'),
                             ('email', 'a..b@example.com'), ('password', 'too short')]:
            with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                Registration(**({'username':'valid','email':'valid@example.com','password':'twelve characters'} | {field:value}))

    def test_client_cannot_choose_principal_or_role(self):
        for extra in ({'role':'owner'}, {'principal_id':'10000000-0000-0000-0000-000000000001'}):
            with self.assertRaises(ValidationError):
                Registration(username='valid',email='valid@example.com',password='twelve characters',**extra)
        with self.assertRaises(ValidationError):
            Login(role='owner',password='twelve characters')


if __name__ == '__main__':
    unittest.main()
