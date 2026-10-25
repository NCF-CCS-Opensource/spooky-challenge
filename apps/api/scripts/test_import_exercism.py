import subprocess
import sys
import unittest

from import_exercism import DRIVER, convert_tests, parse_hints

TESTS = '''
import unittest
from half import half, halves

class HalfTest(unittest.TestCase):
    def test_direct(self):
        self.assertEqual(half(4), 2)

    def test_stored_result(self):
        actual_result = half(10)
        error_message = f"got {actual_result}"
        self.assertIs(actual_result, 5, msg=error_message)

    def test_table(self):
        input_data = [(2, 6), (0, 0)]
        result_data = [[1, 3], [0, 0]]
        for variant, (params, expected) in enumerate(zip(input_data, result_data), start=1):
            with self.subTest(f"variation #{variant}"):
                self.assertEqual(halves(*params), expected)

    def test_error(self):
        with self.assertRaises(ValueError) as err:
            half(-1)
        self.assertEqual(err.exception.args[0], "negative")
'''

SOLUTION = '''
def half(number):
    return number / 2

def halves(*numbers):
    return [number // 2 for number in numbers]
'''


class ConvertTests(unittest.TestCase):
    def test_converts_direct_stored_and_table_asserts_and_drops_raises(self):
        cases = convert_tests(TESTS, {"half", "halves"})
        self.assertEqual([case["stdin"] for case in cases], ["half(4)", "half(10)", "halves(2, 6)", "halves(0, 0)"])
        self.assertEqual([case["expected_output"] for case in cases], ["2", "5", "[1, 3]", "[0, 0]"])

    def test_rejects_exercise_with_inexpressible_assertion(self):
        self.assertIsNone(convert_tests(TESTS + "    def test_set(self):\n        self.assertEqual(half(2), {1})\n", {"half"}))

    def test_driver_output_matches_expected_for_a_correct_solution(self):
        for case in convert_tests(TESTS, {"half", "halves"}):
            run = subprocess.run([sys.executable, "-I", "-c", SOLUTION + DRIVER], input=case["stdin"],
                                 capture_output=True, text=True, check=True)
            self.assertEqual(run.stdout.rstrip(), case["expected_output"])

    def test_hints_are_bullets_with_link_text(self):
        markdown = "# Hints\n\n## General\n\n- Use [a loop][loops] here.\n  Keep going.\n\n[loops]: https://example.com\n"
        self.assertEqual(parse_hints(markdown), ["Use a loop here. Keep going."])


if __name__ == "__main__":
    unittest.main()
