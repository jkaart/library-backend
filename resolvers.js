const { GraphQLError } = require('graphql')
const jwt = require('jsonwebtoken')

const { PubSub } = require('graphql-subscriptions')
const pubsub = new PubSub()

const Book = require('./models/book')
const Author = require('./models/author')
const User = require('./models/user')

const resolvers = {
  Query: {
    bookCount: async () => Book.collection.countDocuments(),
    authorCount: async () => Author.collection.countDocuments(),
    allBooks: async (root, args) => {
      const books = await Book.find({}).populate('author')

      if (!(args.author || args.genre)) {
        return books
      }
      let filteredBooks = []
      if (args.author) {
        filteredBooks = books.filter(book => book.author.name === args.author)
      }
      if (args.genre) {
        if (filteredBooks.length === 0) {
          filteredBooks = args.genre === 'all genres' ? books : books.filter(book => book.genres.includes(args.genre))
          return filteredBooks
        }
        filteredBooks = args.genre === 'all genres' ? filteredBooks : filteredBooks.filter(book => book.genres.includes(args.genre))
      }
      return filteredBooks
    },
    allAuthors: async (root, args, context) => {
      const authors = await Author.find({})
      const books = await Book.find({}).populate('author')
      const booksCount = books.reduce((accumulator, current) => {
        const authorName = current.author.name
        accumulator[authorName] = !accumulator[authorName]
          ? 1
          : accumulator[authorName] + 1
        return accumulator
      }, {})
      context.booksCount = booksCount
      return authors
    },
    me: (root, args, context) => {
      return context.currentUser
    },
    allGenres: async () => {
      const result = await Book.find({}).select({ genres: 1, _id: 0 })
      return [...new Set(result.flatMap(book => book.genres)), 'all genres']
    }
  },
  Subscription: {
    bookAdded: {
      subscribe: () => pubsub.asyncIterableIterator('BOOK_ADDED')
    },
  },
  Author: {
    bookCount: async (root, args, context) => {
      const author = root.name
      const booksCount = context.booksCount[author]

      return booksCount !== undefined ? booksCount : Book.countDocuments({ author: root })
      /*
      return Book.countDocuments({ author: root }) */
    },
    name: async (root) => {
      const author = await Author.findById(root)
      return author.name
    }
  },
  Mutation: {
    addBook: async (root, args, context) => {
      try {
        const currentUser = context.currentUser
        if (!currentUser) {
          throw new GraphQLError('not authenticated', {
            extensions: {
              code: 'BAD_USER_INPUT',
            }
          })
        }
        const existingBook = await Book.findOne({ title: args.title })
        if (existingBook) {
          throw new GraphQLError('Book title must be unique', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.title,
            }
          })
        }
        try {
          let author = await Author.findOne({ name: args.author })
          if (!author) {
            author = new Author({ name: args.author, born: null })
            await author.save()
          }
          const book = new Book({ ...args, author: author._id })
          await book.save()
          pubsub.publish('BOOK_ADDED', { bookAdded: book })

          return book
        }
        catch (error) {
          console.log(error)
          throw new GraphQLError('Author saving failed', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.author,
              error
            }
          })
        }
      }
      catch (error) {
        console.log('error', error)
        throw new GraphQLError('Book saving failed', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.title,
            error
          }
        })
      }
    },
    editAuthor: async (root, args, context) => {
      try {
        const currentUser = context.currentUser

        if (!currentUser) {
          throw new GraphQLError('not authenticated', {
            extensions: {
              code: 'BAD_USER_INPUT',
            }
          })
        }

        return Author.findOneAndUpdate({ name: args.name }, { born: args.setBornTo }, { new: true })
      }
      catch (error) {
        return error
      }
    },
    createUser: async (root, args) => {
      const user = new User({ username: args.username, favoriteGenre: args.favoriteGenre })
      return user.save()
        .catch(error => {
          throw new GraphQLError('Creating the user failed', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.username,
              error
            }
          })
        })
    },
    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })
      if (!user || args.password !== 'secret') {
        throw new GraphQLError('wrong credentials', {
          extensions: {
            code: 'BAD_USER_INPUT'
          }
        })
      }
      const userForToken = {
        username: user.username,
        id: user._id,
      }
      return { value: jwt.sign(userForToken, process.env.JWT_SECRET) }
    },
  }
}

module.exports = resolvers