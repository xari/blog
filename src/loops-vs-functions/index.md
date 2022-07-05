---
title: Loops vs. Functions (in JS)
date: 2021-11-13
description: Benchmarking different approaches to a classic algorithm problem.
---

I recently did a deep-dive into classic algorithm problems in JavaScript.
As I worked my way through the material, I often read that loops were more performant than array methods.
As a functional enthusiast this peaked my curiosity, so I decided to write a benchmarking suite to test that claim.

This post examines the results of my benchmarking suite, and offers my own thoughts on why I prefer to forgo loops in lieu of function composition.

<div class="call-out-indigo">

#### My testing environment

These tests were carried-out on my mid-2015 MacBook Pro 2.5 GHz Quad-Core i7 with 16GB of RAM.
I used the [Benchmark.js](https://benchmarkjs.com/) library, and you can find the source code for all approaches and the benchmarking test suite [here on GitHub](https://github.com/xari/perf-eval/blob/main/solutions.test.js).

</div>

#### The problem

The benchmark tests seven functions that I wrote to solve the following algorithm problem.

> Write a function that, given an array `A` of N integers, returns the smallest positive integer **(greater than 0)** that does not occur in `A`.
>
> For example, given `A = [1, 3, 6, 4, 1, 2]`, the function should return `5`.
>
> Assume that N is an integer within the range `[1..100,000]`; each element of array `A` is an integer within the range `[−1,000,000..1,000,000]`.

From this description, we can intuit that the solution will be a function that takes an unsorted array of integers, sorts it, and then iterates through it to return the first positive integer that isn't in the original array.
In other words, the array will need to be sorted, filtered, and reduced to a single value that is the first positive integer.

Each of the functions in this benchmark solves this problem, and is named according to the pattern that it employs (`classic_for`, `es6_for_of`, .etc).

#### A classic `for` loop

Let's take a look at the first approach, which uses a classic for loop.

```js
function classic_for(A) {
  // Sort the array in ascending order
  A = A.sort((a, b) => a - b)

  // Start at 1
  let x = 1

  for (let i = 0; i < A.length; i++) {
    if (x < A[i]) {
      // If the array doesn't start a 1, return 1 immediately
      return x
    } else if (A[i] > 0) {
      // Otherwise set x to the next item in the array
      x = A[i] + 1
    }
  }

  return x
}
```

Calling this function with an array of `456789` integers yields the following performance throughput.

> `classic_for x 98.75 ops/sec ±0.21% (71 runs sampled)`

ES6 offers a syntactically condensed version of the classic `for` loop with its `for...of` statement, and [I've included a solution that uses it in the repository](https://github.com/xari/perf-eval/blob/393fe3529f548d94ffa047968a47d17b2ad25b97/solutions.js#L21).
The `for...of` solution had the following throughput, which is more or less the same as that of the `for` loop.

> `es6_for_of x 99.61 ops/sec ±0.28% (73 runs sampled)`

The `for` loop approaches come in at almost `100 ops/sec` using 14 lines of code.
Let's see whether ES6's functional array methods can compete with that.

#### ES6 `Array` methods

ES6 was a giant leap for JavaScript that, among other things, offered developers functional `Array` methods like `filter`, `map` and `reduce`.
[The most versitile of all these](https://xari.dev/reducers_and_transducers/) is the `Array.reduce` method, which we can see at work below.

```js
function es6_reduce(A) {
  return A.sort((a, b) => a - b).reduce(
    (prev, n) => (n > 0 ? (n === prev ? n + 1 : prev) : prev),
    1
  )
}
```

The function above performs the exact same job as the classic `for` loop further up the page.
But it does that using a very different approach under-the-hood, resulting in a notably lower benchmark score.

> `es6_reduce x 70.24 ops/sec ±0.29% (72 runs sampled)`

The `Array.forEach` method ([see GitHub](https://github.com/xari/perf-eval/blob/393fe3529f548d94ffa047968a47d17b2ad25b97/solutions.js#L37)) scored a similar number.

> `es6_forEach x 72.16 ops/sec ±0.40% (74 runs sampled)`

<div class="call-out-indigo">

The truely savvy among those reading this post will have noted that the `es6_reduce` function above doesn't offer the early `return` feature of the `classic_for` approach.
The benefit of this feature is that it will break the loop in the first iteration if the first item in the array is larger than `1`.

Here's a `reduce`-based solution that can do this.

```js
function es6_reduce_eject(A) {
  return A.sort((a, b) => a - b).reduce((prev, n, i, arr) => {
    arr[0] > 1 && arr.splice(1)

    return n > 0 ? (n === prev ? n + 1 : prev) : prev
  }, 1)
}
```

The function above may not be pretty, but if `A` begins with an integer greater than `1`, it will provide a significant performance gain.
However, the array used in this benchmark begins at `-123` and contains only consecutive integers, so this early return didn't help the following score.

> `es6_reduce_eject x 67.27 ops/sec ±0.53% (69 runs sampled)`

</div>

Array methods like `reduce` offer condensed syntax, but for now, they don't seem to provide the same raw performance of `for` loops.

#### Ramda

[Ramda](https://ramdajs.com/) is a functional library for JavaScript that, in addition to many things, offers `filter`, `map` and `reduce` functions that offer an alternative syntax to JavaScrips's array methods, along with [other optimizations](https://github.com/ramda/ramda/issues/2404).

The solution below uses Ramda's `compose` function to compose the `sort` and `reduce` together.

```js
import R from "ramda"

function ramda_reduce(A) {
  const transformer = R.compose(
    R.reduce((prev, n) => (n > 0 ? (n === prev ? n + 1 : prev) : prev), 1),
    R.sort((a, b) => a - b)
  )

  return transformer(A)
}
```

This approach is slightly less performant than the ES6 `reduce` approach, but the composable nature of it offer a lot of flexibility.

> `ramda_reduce x 62.83 ops/sec ±0.37% (65 runs sampled)`

#### Transducers

As a developer, I'm often wrangling data in longer pipelines than the simple sort-filter-reduce manner that I've examined in this post.
The function above (`ramda_reduce`) composes two functions, and each of these will traverse the array once the composed function is invoked.
Each new function that gets added to that `transformer` composition will add another array traversal.
But there's a pattern that can perform any number of these transformations using a single array traversal.
I'm referring to transducers, which I wrote about in [a recent post](https://xari.dev/reducers_and_transducers/).

Ramda offers a `transduce` function, shown at work below, which let me efficiently break-out the filtering step of the algorithm into it's own function, without incresing the number of times that the array is iterated over.

```js
function ramda_transduce(A) {
  return R.transduce(
    R.filter(n => n > 0),
    (prev, n) => (n === prev ? n + 1 : prev),
    1,
    R.sort((a, b) => a - b, A)
  )
}
```

If you've never seen a transducer at work before, I highly reccomend learning how to use them.
This small example might not be enough to convince you, but try to consider how it could be applied to a more complex transformation that filters, maps, and reduces an array over several steps.

The `ramda_transduce` solution has almost the same performance as `ramda_reduce` for this benchmark.
However, it's important to keep in mind that `R.transduce` offers a more scaleable platform for complex transformations.

> `ramda_transduce x 58.47 ops/sec ±0.23% (75 runs sampled)`

#### Wrapping it up

According to the benchmark, the most performant of the tested functions was the `for...of` approach.
The `for`-based approach had virtually the same perfomance as the `for...of`, which makes sense, while the Ramda approaches were the least performant.

```
es6_for_of       x 99.61 ops/sec ±0.28% (73 runs sampled)

classic_for      x 98.75 ops/sec ±0.21% (71 runs sampled)

es6_forEach      x 72.16 ops/sec ±0.40% (74 runs sampled)

es6_reduce       x 70.24 ops/sec ±0.29% (72 runs sampled)

es6_reduce_eject x 67.27 ops/sec ±0.53% (69 runs sampled)

ramda_reduce     x 62.83 ops/sec ±0.37% (65 runs sampled)

ramda_transduce  x 58.47 ops/sec ±0.23% (75 runs sampled)
```

However, all of the approaches above are _performant enough_ to get the job done.
On the [Codility platform](https://www.codility.com/) each of these scored 100% for the posted challenge.

It's important to also reflect on the data that this benchmark used, and how it was being transformed.
The problem that these functions solve is a textbook problem using a very simple array of integers.
It wouldn't surprise me to see a different benchmark for a "real-world" problem that showed Ramda's `reduce` in first place.

Still, after a certain performance threshold, I'd argue that other factors like syntax, immutability, and ease of testability matter far more than marginal performance gains.
It's in these areas that functional patterns really shine.
Ramda's approach is particularly interesting to me, and I'm looking forward to getting to know it better as I dive deeper into this rabbit hole.
